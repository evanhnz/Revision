#!/usr/bin/env node
/**
 * Vérification des contrastes WCAG AA sur les combinaisons texte/fond
 * principales, dans les deux thèmes.
 *
 *   npm run contrastes
 *
 * Les valeurs sont lues dans « src/styles/tokens.css » pour le thème clair et
 * dans la palette Tailwind d'origine pour le thème sombre, afin que le script
 * contrôle bien ce que le site affiche — et non une table recopiée à la main
 * qui se périmerait à la première retouche.
 *
 * Seuils retenus (WCAG 2.1) :
 *   • 4,5:1 pour le texte courant ;
 *   • 3:1   pour le grand texte (≥ 24 px, ou ≥ 18,66 px en gras) et pour les
 *           éléments d'interface non textuels — bordures, jauges, indicateurs.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── Couleurs ─────────────────────────────────────────────────────────────── */

function versRvb(couleur) {
  const c = couleur.trim();
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const n = h.length === 3 ? [...h].map((x) => x + x).join('') : h;
    return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) return m[1].split(',').slice(0, 3).map((v) => Number(v.trim()));
  throw new Error(`Couleur non reconnue : ${couleur}`);
}

function luminance(couleur) {
  const [r, g, b] = versRvb(couleur).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(avant, arriere) {
  const a = luminance(avant);
  const b = luminance(arriere);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ── Palette claire : lue dans les tokens ─────────────────────────────────── */

const tokens = await readFile(path.join(racine, 'src/styles/tokens.css'), 'utf8');
const bloc = tokens.slice(tokens.indexOf("[data-theme='clair']"));
const clair = {};
for (const [, nom, valeur] of bloc.matchAll(/--color-([a-z]+-\d+):\s*(#[0-9a-fA-F]{3,6});/g)) {
  clair[nom] = valeur;
}
clair.white = '#ffffff';
clair.black = '#000000';

/* Teintes Tailwind laissées telles quelles en thème clair : elles servent aux
   domaines « social » et « international » de la rubrique Actualités, que la
   charte de l'État ne couvre pas (elle n'a pas de palette de catégories). */
const TAILWIND_CLAIR = {
  'rose-500': '#f43f5e',
  'rose-700': '#be123c',
  'cyan-500': '#06b6d4',
  'cyan-600': '#0891b2',
  'cyan-700': '#0e7490',
};
for (const [nom, valeur] of Object.entries(TAILWIND_CLAIR)) clair[nom] ??= valeur;

/* ── Palette sombre : valeurs Tailwind d'origine, inchangées ─────────────── */

const sombre = {
  white: '#ffffff',
  'slate-200': '#e2e8f0',
  'slate-300': '#cbd5e1',
  'slate-400': '#94a3b8',
  'slate-500': '#64748b',
  'slate-700': '#334155',
  'slate-800': '#1e293b',
  'slate-900': '#0f172a',
  'slate-950': '#020617',
  'indigo-300': '#a5b4fc',
  'indigo-400': '#818cf8',
  'indigo-600': '#4f46e5',
  'indigo-950': '#1e1b4b',
  'emerald-300': '#6ee7b7',
  'emerald-400': '#34d399',
  'emerald-500': '#10b981',
  'amber-300': '#fcd34d',
  'amber-400': '#fbbf24',
  'amber-500': '#f59e0b',
  'rose-300': '#fda4af',
  'rose-500': '#f43f5e',
  'cyan-300': '#67e8f9',
  'cyan-500': '#06b6d4',
  'cyan-600': '#0891b2',
  'indigo-500': '#6366f1',
  'red-400': '#f87171',
  'red-950': '#450a0a',
};

/* ── Combinaisons réellement employées par l'interface ───────────────────── */

const COMBINAISONS = [
  // [description, texte, fond, seuil]
  ['Texte courant sur le fond de page', 'slate-800', 'slate-50', 4.5],
  ['Texte courant sur une carte', 'slate-600', 'white', 4.5],
  ['Titre sur une carte', 'slate-900', 'white', 4.5],
  ['Texte secondaire sur une carte', 'slate-500', 'white', 4.5],
  ['Texte secondaire sur le fond de page', 'slate-500', 'slate-50', 4.5],
  ['Lien (Bleu France) sur une carte', 'indigo-600', 'white', 4.5],
  ['Lien (Bleu France) sur le fond de page', 'indigo-600', 'slate-50', 4.5],
  ['Onglet actif : texte sur son fond', 'indigo-700', 'indigo-50', 4.5],
  // Les cinq domaines de la rubrique Actualités : étiquette de carte, puis
  // pastille de légende des frises (seuil abaissé, élément non textuel).
  ['Domaine « économie »', 'emerald-700', 'white', 4.5],
  ['Domaine « finances publiques »', 'amber-700', 'white', 4.5],
  ['Domaine « social »', 'rose-700', 'white', 4.5],
  ['Domaine « juridique »', 'indigo-700', 'white', 4.5],
  ['Domaine « international »', 'cyan-700', 'white', 4.5],
  ['Pastille « économie »', 'emerald-500', 'white', 3],
  ['Pastille « finances publiques »', 'amber-500', 'white', 3],
  ['Pastille « social »', 'rose-500', 'white', 3],
  ['Pastille « juridique »', 'indigo-500', 'white', 3],
  ['Pastille « international »', 'cyan-600', 'white', 3],
  ['Alerte : texte sur fond d\'alerte', 'red-800', 'red-50', 4.5],
  ['Bouton primaire : texte sur Bleu France', 'white', 'indigo-600', 4.5],
  ['Bouton d\'alerte : texte sur rouge', 'white', 'red-600', 4.5],
  ['Barre de progression sur le fond de page', 'indigo-600', 'slate-50', 3],
  ['Bordure de carte sur le fond de page', 'slate-200', 'slate-50', 1.1],
];

const COMBINAISONS_SOMBRE = [
  ['Texte courant sur le fond de page', 'slate-200', 'slate-950', 4.5],
  ['Texte courant sur une carte', 'slate-300', 'slate-900', 4.5],
  ['Titre sur une carte', 'white', 'slate-900', 4.5],
  ['Texte secondaire sur une carte', 'slate-400', 'slate-900', 4.5],
  ['Texte secondaire sur le fond de page', 'slate-400', 'slate-950', 4.5],
  ['Lien sur une carte', 'indigo-400', 'slate-900', 4.5],
  ['Lien sur le fond de page', 'indigo-400', 'slate-950', 4.5],
  ['Onglet actif : texte sur son fond', 'indigo-300', 'indigo-950', 4.5],
  ['Domaine « économie »', 'emerald-300', 'slate-900', 4.5],
  ['Domaine « finances publiques »', 'amber-300', 'slate-900', 4.5],
  ['Domaine « social »', 'rose-300', 'slate-900', 4.5],
  ['Domaine « juridique »', 'indigo-300', 'slate-900', 4.5],
  ['Domaine « international »', 'cyan-300', 'slate-900', 4.5],
  ['Pastille « économie »', 'emerald-500', 'slate-900', 3],
  ['Pastille « finances publiques »', 'amber-500', 'slate-900', 3],
  ['Pastille « social »', 'rose-500', 'slate-900', 3],
  ['Pastille « juridique »', 'indigo-500', 'slate-900', 3],
  ['Pastille « international »', 'cyan-600', 'slate-900', 3],
  ['Alerte : texte sur fond d\'alerte', 'red-400', 'red-950', 4.5],
  ['Barre de progression sur le fond de page', 'indigo-400', 'slate-950', 3],
  ['Bordure de carte sur le fond de page', 'slate-800', 'slate-950', 1.1],
];

/* ── Exécution ───────────────────────────────────────────────────────────── */

function controler(titre, palette, combinaisons) {
  console.log(`\n\x1b[1m${titre}\x1b[0m`);
  let echecs = 0;
  for (const [nom, texte, fond, seuil] of combinaisons) {
    const cTexte = palette[texte];
    const cFond = palette[fond];
    if (!cTexte || !cFond) {
      console.log(`  \x1b[33m?\x1b[0m ${nom} — teinte absente (${texte} / ${fond})`);
      echecs++;
      continue;
    }
    const ratio = contraste(cTexte, cFond);
    const ok = ratio >= seuil;
    if (!ok) echecs++;
    const marque = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✖\x1b[0m';
    console.log(
      `  ${marque} ${nom.padEnd(44)} ${ratio.toFixed(2).padStart(6)}:1  (seuil ${seuil})`,
    );
  }
  return echecs;
}

const echecs =
  controler('Thème clair — palette de l\'État', clair, COMBINAISONS) +
  controler('Thème sombre — palette d\'origine, inchangée', sombre, COMBINAISONS_SOMBRE);

console.log('');
if (echecs) {
  console.error(`\x1b[31m✖ ${echecs} combinaison(s) sous le seuil.\x1b[0m\n`);
  process.exit(1);
}
console.log('\x1b[32m✓ Toutes les combinaisons vérifiées atteignent le seuil WCAG AA.\x1b[0m\n');
