/**
 * Contrôle des sections « ## Prétest », sans passer par le chiffrement.
 *
 * Le build complet valide déjà tout le contenu, mais il chiffre 390 Mo au
 * passage : deux minutes pour savoir si une virgule manque. Ce script fait la
 * seule vérification utile pendant la rédaction, en une seconde.
 *
 * Il contrôle aussi deux choses que le schéma ne peut pas voir.
 *
 * 1. Qu'une question de prétest ne recopie pas une question du quiz de la même
 *    fiche. Une question vue corrigée en prétest ne mesure plus rien lorsqu'elle
 *    revient au quiz — et le quiz alimente désormais l'estimation de niveau.
 * 2. Qu'aucune question ne porte sur **l'épreuve** : sa durée, son coefficient,
 *    le plan attendu, ce qu'en dit le jury. Un prétest sert à ouvrir la lecture
 *    d'un sujet, pas à réviser le mode d'emploi du concours ; ces questions-là
 *    sont à proscrire.
 */
import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import YAML from 'yaml';
import { decouperSections } from './lib/markdown.mjs';
import { quizSchema } from './lib/schema.mjs';
import { motDeLEpreuve } from './lib/pretest.mjs';

/**
 * Même lecture que le build, en plus court : on n'a pas besoin de collecter les
 * erreurs pour les afficher à la fin, on les dit tout de suite.
 */
function parserListeYaml(texte, contexte) {
  if (!texte?.trim()) return [];
  const nettoye = texte.replace(/^\s*```(?:ya?ml)?\s*$/gim, '').trim();
  if (!nettoye) return [];
  try {
    const donnees = YAML.parse(nettoye);
    if (donnees === null || donnees === undefined) return [];
    if (!Array.isArray(donnees)) {
      console.log(`✗ ${contexte} : le bloc doit être une liste « - ... »`);
      return [];
    }
    return donnees;
  } catch (e) {
    console.log(`✗ ${contexte} : bloc YAML invalide (${e.message.split('\n')[0]})`);
    return [];
  }
}

const racine = 'content';
const fiches = [];
(function explorer(dossier) {
  for (const nom of readdirSync(dossier)) {
    const complet = path.join(dossier, nom);
    if (statSync(complet).isDirectory()) explorer(complet);
    else if (nom.endsWith('.md') && !nom.endsWith('.podcast.md')) fiches.push(complet);
  }
})(racine);

const normaliser = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

let erreurs = 0;
let avec = 0;
let questions = 0;
const parDossier = new Map();

for (const chemin of fiches.sort()) {
  const { content } = matter(await readFile(chemin, 'utf8'));
  const { sections } = decouperSections(content);
  const dossier = path.dirname(chemin).replace('content/', '');
  if (!parDossier.has(dossier)) parDossier.set(dossier, { total: 0, avec: 0 });
  parDossier.get(dossier).total += 1;
  if (!sections.pretest.trim()) continue;
  avec += 1;
  parDossier.get(dossier).avec += 1;

  const lues = parserListeYaml(sections.pretest, `${chemin} (## Prétest)`);
  const valides = [];
  for (const item of lues) {
    const r = quizSchema.safeParse(item);
    if (!r.success) {
      erreurs += 1;
      console.log(`✗ ${chemin} : ${r.error.issues.map((i) => i.message).join(' ; ')}`);
      continue;
    }
    valides.push(r.data);
  }
  questions += valides.length;

  if (valides.length < 3 || valides.length > 16) {
    erreurs += 1;
    console.log(`✗ ${chemin} : ${valides.length} question(s), le vivier en demande 3 à 16`);
  }

  const vues = new Set();
  for (const q of valides) {
    const clef = normaliser(q.question);
    if (vues.has(clef)) {
      erreurs += 1;
      console.log(`✗ ${chemin} : question de prétest en double — « ${q.question} »`);
    }
    vues.add(clef);
  }

  for (const q of valides) {
    const mot = motDeLEpreuve(q.question);
    if (mot) {
      erreurs += 1;
      console.log(
        `✗ ${chemin} : « ${q.question} » porte sur l'épreuve (« ${mot} ») — proscrit en prétest`,
      );
    }
  }

  const duQuiz = new Set(
    parserListeYaml(sections.quiz, `${chemin} (## Quiz)`)
      .map((q) => (typeof q.question === 'string' ? normaliser(q.question) : ''))
      .filter(Boolean),
  );
  for (const q of valides) {
    if (duQuiz.has(normaliser(q.question))) {
      erreurs += 1;
      console.log(`✗ ${chemin} : « ${q.question} » est déjà une question du quiz`);
    }
  }
}

console.log(`\n${avec}/${fiches.length} fiche(s) avec prétest, ${questions} question(s) au total`);
const restants = [...parDossier.entries()].filter(([, c]) => c.avec < c.total);
if (restants.length) {
  console.log('\nreste à écrire :');
  for (const [dossier, c] of restants.sort()) {
    console.log(`  ${dossier.padEnd(42)} ${c.total - c.avec} / ${c.total}`);
  }
}
console.log(erreurs ? `\n✖ ${erreurs} problème(s)\n` : '\n✓ aucun problème\n');
process.exit(erreurs ? 1 : 0);
