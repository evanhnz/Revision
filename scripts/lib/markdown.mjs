/**
 * Lecture d'une fiche Markdown : front-matter, découpage en sections,
 * rendu HTML (avec soulignement du glossaire) et extraction du texte brut.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { remarkGlossaire, normaliser } from './glossaire.mjs';

/** Titres de section reconnus -> clé interne. */
const SECTIONS = new Map([
  ['cours complet', 'cours'],
  ['cours', 'cours'],
  ['fiche simplifiee', 'fiche'],
  ['fiche de synthese', 'fiche'],
  ['fiche simplifie', 'fiche'],
  ['flashcards', 'flashcards'],
  ['flashcard', 'flashcards'],
  ['quiz', 'quiz'],
  ['qcm', 'quiz'],
  ['pretest', 'pretest'],
  ['pre-test', 'pretest'],
  ['pre test', 'pretest'],
  ['auto-questionnement', 'pretest'],
]);

/**
 * Découpe le corps Markdown en sections de niveau « ## ».
 * Un « ## » non reconnu est rattaché à la section en cours (il s'agit alors
 * d'un sous-titre du cours), et signalé à l'appelant.
 */
export function decouperSections(corps) {
  const lignes = corps.split(/\r?\n/);
  const sections = { cours: [], fiche: [], flashcards: [], quiz: [], pretest: [] };
  const inconnues = [];
  let courante = null;
  let dansBlocCode = false;

  for (const ligne of lignes) {
    if (/^\s*(```|~~~)/.test(ligne)) dansBlocCode = !dansBlocCode;

    const titre = !dansBlocCode && /^##\s+(.+?)\s*$/.exec(ligne);
    if (titre) {
      const cle = SECTIONS.get(normaliser(titre[1]));
      if (cle) {
        courante = cle;
        continue;
      }
      if (courante) inconnues.push(titre[1]);
    }
    if (courante) sections[courante].push(ligne);
  }

  return {
    sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join('\n').trim()])),
    inconnues,
  };
}

/** Convertit un Markdown en HTML, en soulignant les termes du glossaire. */
export function rendreHtml(markdown, indexGlossaire, options = {}) {
  if (!markdown?.trim()) return '';
  const processeur = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkGlossaire, {
      index: indexGlossaire,
      premiereOccurrenceSeulement: options.premiereOccurrenceSeulement ?? false,
      dejaVus: options.dejaVus ?? new Set(),
    })
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeStringify);
  return String(processeur.processSync(markdown));
}

/** Texte brut d'un Markdown : sert à l'index de recherche. */
export function texteBrut(markdown) {
  if (!markdown?.trim()) return '';
  const arbre = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const morceaux = [];
  visit(arbre, (noeud) => {
    if (noeud.type === 'text' || noeud.type === 'inlineCode') morceaux.push(noeud.value);
  });
  return morceaux.join(' ').replace(/\s+/g, ' ').trim();
}

/** Extrait la table des matières (titres ### et ####) pour la navigation interne. */
export function extraireSommaire(html) {
  const sommaire = [];
  const regex = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    sommaire.push({
      niveau: Number(m[1]),
      id: m[2],
      titre: m[3].replace(/<[^>]+>/g, '').trim(),
    });
  }
  return sommaire;
}
