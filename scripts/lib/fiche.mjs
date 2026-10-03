/**
 * Format standard d'une fiche : lecture, validation et écriture.
 *
 * Ce module est partagé par le build (Node) et par l'éditeur intégré
 * (navigateur). Il ne dépend donc d'aucun module Node : une fiche déposée à la
 * main, importée dans l'éditeur ou écrite par lui passe par exactement les
 * mêmes règles, et l'éditeur réécrit exactement le format qu'il sait relire.
 *
 * Le format :
 *
 *   ---
 *   titre: "Les vices du consentement"
 *   chemin: ["Droit des obligations", "Le contrat", "La formation du contrat"]
 *   ordre: 3
 *   tags: [erreur, dol, violence]
 *   ---
 *
 *   ## Prétest         (liste YAML, format du quiz)
 *   ## Cours complet   (Markdown)
 *   ## Fiche simplifiée (Markdown)
 *   ## Flashcards      (liste YAML : q / r)
 *   ## Quiz            (liste YAML : question / options / reponse / explication)
 *
 * Toutes les sections sont facultatives. L'ancien couple « matiere » +
 * « fascicule » reste accepté et se lit comme un chemin à deux niveaux.
 */
import YAML from 'yaml';
import { frontMatterSchema, flashcardSchema, quizSchema } from './schema.mjs';
import { decouperSections } from './markdown.mjs';

/** Ordre et titres canoniques des sections, tels que l'éditeur les écrit. */
export const SECTIONS_CANONIQUES = [
  { cle: 'pretest', titre: 'Prétest', yaml: true },
  { cle: 'cours', titre: 'Cours complet', yaml: false },
  { cle: 'fiche', titre: 'Fiche simplifiée', yaml: false },
  { cle: 'flashcards', titre: 'Flashcards', yaml: true },
  { cle: 'quiz', titre: 'Quiz', yaml: true },
];

/** Bornes du vivier de prétest : en dehors, simple avertissement. */
export const PRETEST_MIN = 3;
export const PRETEST_MAX = 16;

/**
 * Sépare le front-matter (entre deux lignes « --- ») du corps.
 * Retourne { data, corps, ligneCorps } ou lève une erreur lisible.
 */
export function separerFrontMatter(texte) {
  const propre = texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(propre);
  if (!m) {
    throw new Error(
      'en-tête absent : la fiche doit commencer par une ligne « --- », ' +
        'les champs titre et chemin, puis une seconde ligne « --- ».',
    );
  }
  let data;
  try {
    data = YAML.parse(m[1]) ?? {};
  } catch (e) {
    throw new Error(`en-tête illisible (${String(e.message).split('\n')[0]})`);
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('en-tête illisible : il doit contenir des champs « nom: valeur ».');
  }
  const ligneCorps = m[0].split('\n').length;
  return { data, corps: propre.slice(m[0].length), ligneCorps };
}

/** Lit une section YAML (liste), tolérante aux blocs de code ```yaml. */
function lireListe(texte, nomSection, erreurs) {
  if (!texte?.trim()) return [];
  const nettoye = texte.replace(/^\s*```(?:ya?ml)?\s*$/gim, '').trim();
  if (!nettoye) return [];
  let donnees;
  try {
    donnees = YAML.parse(nettoye);
  } catch (e) {
    const ligne = e.linePos?.[0]?.line;
    erreurs.push(
      `${nomSection} : liste YAML invalide${ligne ? ` (ligne ${ligne} de la section)` : ''} — ` +
        String(e.message).split('\n')[0],
    );
    return [];
  }
  if (donnees == null) return [];
  if (!Array.isArray(donnees)) {
    erreurs.push(`${nomSection} : la section doit être une liste d'éléments commençant par « - ».`);
    return [];
  }
  return donnees;
}

const messages = (r) => r.error.issues.map((i) => i.message).join(' ; ');

/**
 * Analyse complète d'une fiche.
 *
 * Ne lève jamais : tout problème est rapporté dans « erreurs » (la fiche est
 * alors refusée) ou « avertissements » (elle est acceptée). Retourne aussi les
 * sections brutes, dont l'éditeur a besoin pour pré-remplir ses onglets.
 */
export function analyserFiche(texte) {
  const erreurs = [];
  const avertissements = [];
  const resultat = {
    erreurs,
    avertissements,
    meta: null,
    brut: { pretest: '', cours: '', fiche: '', flashcards: '', quiz: '' },
    flashcards: [],
    quiz: [],
    pretest: [],
  };

  let entete;
  try {
    entete = separerFrontMatter(texte);
  } catch (e) {
    erreurs.push(e.message);
    return resultat;
  }

  const fm = frontMatterSchema.safeParse(entete.data);
  if (!fm.success) {
    erreurs.push(
      'en-tête : ' +
        fm.error.issues.map((i) => `${i.path.join('.') || 'racine'} : ${i.message}`).join(' ; '),
    );
    return resultat;
  }
  resultat.meta = fm.data;

  const { sections, inconnues } = decouperSections(entete.corps);
  resultat.brut = sections;
  if (inconnues.length) {
    avertissements.push(
      `titres « ## » non reconnus, rattachés à la section précédente : ${inconnues.join(', ')}.`,
    );
  }
  if (!Object.values(sections).some((s) => s.trim())) {
    avertissements.push('aucune section remplie : la fiche est vide.');
  }

  for (const item of lireListe(sections.flashcards, 'Flashcards', erreurs)) {
    const r = flashcardSchema.safeParse(item);
    if (r.success) resultat.flashcards.push(r.data);
    else erreurs.push(`Flashcards : ${messages(r)}`);
  }
  for (const item of lireListe(sections.quiz, 'Quiz', erreurs)) {
    const r = quizSchema.safeParse(item);
    if (r.success) resultat.quiz.push(r.data);
    else erreurs.push(`Quiz : ${messages(r)}`);
  }
  for (const item of lireListe(sections.pretest, 'Prétest', erreurs)) {
    const r = quizSchema.safeParse(item);
    if (r.success) resultat.pretest.push(r.data);
    else erreurs.push(`Prétest : ${messages(r)}`);
  }
  const n = resultat.pretest.length;
  if (n && (n < PRETEST_MIN || n > PRETEST_MAX)) {
    avertissements.push(
      `Prétest : ${n} question(s). Visez ${PRETEST_MIN} à ${PRETEST_MAX} : le site en tire trois ` +
        'au hasard, et un vivier fourni évite que deux passages se ressemblent.',
    );
  }

  // Deux cartes identiques auraient le même identifiant de révision.
  const doublons = (liste, nom) => {
    const vus = new Set();
    for (const { question } of liste) {
      const cle = question.trim().toLowerCase();
      if (vus.has(cle)) erreurs.push(`${nom} : question en double « ${question.slice(0, 70)} ».`);
      vus.add(cle);
    }
  };
  doublons(resultat.flashcards, 'Flashcards');
  doublons(resultat.quiz, 'Quiz');
  doublons(resultat.pretest, 'Prétest');

  return resultat;
}

/* ══════════════════════════════════════════════════════════════════════════
   Écriture
   ══════════════════════════════════════════════════════════════════════════ */

const optionsYaml = { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' };

/** Sérialise une liste d'objets en YAML lisible, chaînes entre guillemets. */
export function listeEnYaml(liste) {
  if (!liste?.length) return '';
  return YAML.stringify(liste, optionsYaml).trim();
}

/** Convertit les questions normalisées (« bonnes » en indices) au format écrit. */
export function questionsEnYaml(questions) {
  return listeEnYaml(
    questions.map((q) => {
      const sortie = { question: q.question, options: q.options };
      const textes = q.bonnes.map((i) => q.options[i]);
      if (textes.length === 1) sortie.reponse = textes[0];
      else sortie.reponses = textes;
      if (q.explication) sortie.explication = q.explication;
      return sortie;
    }),
  );
}

export function flashcardsEnYaml(cartes) {
  return listeEnYaml(cartes.map((c) => ({ q: c.question, r: c.reponse })));
}

/**
 * Écrit une fiche au format standard.
 *
 * @param meta     { titre, chemin, ordre?, tags? }
 * @param sections { pretest, cours, fiche, flashcards, quiz } — texte brut
 *                 (Markdown pour cours/fiche, YAML pour les listes)
 */
export function ecrireFiche(meta, sections) {
  const entete = { titre: meta.titre, chemin: meta.chemin };
  if (meta.ordre !== undefined && meta.ordre !== null && meta.ordre !== 999) entete.ordre = meta.ordre;
  entete.tags = meta.tags ?? [];
  const yamlEntete = YAML.stringify(entete, { ...optionsYaml, flowCollectionPadding: false })
    // Chemin et tags sur une ligne : c'est plus lisible et plus court.
    .replace(/^chemin:\n((?:\s+- .*\n)+)/m, (_, l) => `chemin: [${lignesEnListe(l)}]\n`)
    .replace(/^tags:\n((?:\s+- .*\n)+)/m, (_, l) => `tags: [${lignesEnListe(l)}]\n`)
    .replace(/^tags: \[\]\n/m, 'tags: []\n');

  let sortie = `---\n${yamlEntete.trim()}\n---\n`;
  for (const { cle, titre } of SECTIONS_CANONIQUES) {
    const contenu = (sections[cle] ?? '').trim();
    if (!contenu) continue;
    sortie += `\n## ${titre}\n\n${contenu}\n`;
  }
  return sortie;
}

function lignesEnListe(lignes) {
  return lignes
    .split('\n')
    .map((l) => l.replace(/^\s+- /, '').trim())
    .filter(Boolean)
    .join(', ');
}

/** Nom de fichier opaque et stable pour une nouvelle fiche. */
export function nouveauNomFichier() {
  const octets = new Uint8Array(6);
  globalThis.crypto.getRandomValues(octets);
  return `fiches/${Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('')}.md`;
}
