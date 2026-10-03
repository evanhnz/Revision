/**
 * Modèle de l'éditeur : les fiches sources, l'arborescence des catégories et
 * le glossaire, tels qu'ils sont dans les fichiers — et non tels que le site
 * publié les affiche. L'éditeur travaille sur la source, le build en dérive
 * le site.
 */
import YAML from 'yaml';
import { analyserFiche, ecrireFiche } from '../../../scripts/lib/fiche.mjs';
import type { Depot, FichierSource } from './depot';

export const FICHIER_CATEGORIES = 'categories.yml';
export const FICHIER_GLOSSAIRE = 'glossaire.yml';

export interface Question {
  question: string;
  options: string[];
  bonnes: number[];
  explication?: string;
}

export interface Carte {
  question: string;
  reponse: string;
}

export interface Meta {
  titre: string;
  chemin: string[];
  ordre: number;
  tags: string[];
}

export interface Analyse {
  erreurs: string[];
  avertissements: string[];
  meta: Meta | null;
  brut: { pretest: string; cours: string; fiche: string; flashcards: string; quiz: string };
  flashcards: Carte[];
  quiz: Question[];
  pretest: Question[];
}

export interface FicheSource {
  fichier: string;
  texte: string;
  analyse: Analyse;
}

export interface Categorie {
  nom: string;
  icone?: string;
  enfants: Categorie[];
}

export interface Terme {
  terme: string;
  formes: string[];
  definition: string;
}

export interface Noeud {
  nom: string;
  chemin: string[];
  icone?: string;
  /** Présente dans categories.yml (et non seulement déduite d'une fiche). */
  declaree: boolean;
  enfants: Noeud[];
  fiches: FicheSource[];
}

export const analyser = (texte: string): Analyse => analyserFiche(texte);

export const ecrire = (meta: Meta, sections: Record<string, string>): string => ecrireFiche(meta, sections);

export const estFiche = (chemin: string) => chemin.endsWith('.md');

/* ══════════════════════════════════════════════════════════════════════════
   Lecture
   ══════════════════════════════════════════════════════════════════════════ */

export interface Contenu {
  fiches: FicheSource[];
  categories: Categorie[];
  glossaire: Terme[];
  /** Problèmes de lecture de categories.yml ou glossaire.yml. */
  problemes: string[];
}

function normaliserCategories(donnees: unknown): Categorie[] {
  if (!Array.isArray(donnees)) return [];
  return donnees
    .filter((c) => c && typeof c === 'object' && String((c as Categorie).nom ?? '').trim())
    .map((c) => ({
      nom: String((c as Categorie).nom).trim(),
      ...((c as Categorie).icone ? { icone: String((c as Categorie).icone) } : {}),
      enfants: normaliserCategories((c as Categorie).enfants),
    }));
}

function normaliserGlossaire(donnees: unknown): Terme[] {
  if (!Array.isArray(donnees)) return [];
  return donnees
    .filter((t) => t && typeof t === 'object' && (t as Terme).terme)
    .map((t) => ({
      terme: String((t as Terme).terme),
      formes: Array.isArray((t as Terme).formes) ? (t as Terme).formes.map(String) : [],
      definition: String((t as Terme).definition ?? ''),
    }));
}

export function lireContenu(fichiers: FichierSource[]): Contenu {
  const problemes: string[] = [];
  const lireYaml = (nom: string) => {
    const f = fichiers.find((x) => x.chemin === nom);
    if (!f) return [];
    try {
      return YAML.parse(f.contenu) ?? [];
    } catch (e) {
      problemes.push(`${nom} illisible : ${e instanceof Error ? e.message.split('\n')[0] : e}`);
      return [];
    }
  };
  return {
    fiches: fichiers
      .filter((f) => estFiche(f.chemin))
      .map((f) => ({ fichier: f.chemin, texte: f.contenu, analyse: analyser(f.contenu) })),
    categories: normaliserCategories(lireYaml(FICHIER_CATEGORIES)),
    glossaire: normaliserGlossaire(lireYaml(FICHIER_GLOSSAIRE)),
    problemes,
  };
}

export async function chargerContenu(depot: Depot): Promise<Contenu> {
  return lireContenu(await depot.lister());
}

/* ══════════════════════════════════════════════════════════════════════════
   Arborescence
   ══════════════════════════════════════════════════════════════════════════ */

const memeNom = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Même règle que le build : l'arbre de categories.yml, complété par les
 * chemins des fiches. Les fiches illisibles sont rangées à part.
 */
export function construireArbre(contenu: Contenu): { racines: Noeud[]; illisibles: FicheSource[] } {
  const racine: Noeud = { nom: '', chemin: [], declaree: true, enfants: [], fiches: [] };
  const illisibles: FicheSource[] = [];

  const obtenir = (parent: Noeud, nom: string, declaree: boolean, icone?: string) => {
    let n = parent.enfants.find((e) => memeNom(e.nom, nom));
    if (!n) {
      n = { nom, chemin: [...parent.chemin, nom], declaree, icone, enfants: [], fiches: [] };
      parent.enfants.push(n);
    } else {
      if (declaree) n.declaree = true;
      if (icone && !n.icone) n.icone = icone;
    }
    return n;
  };
  const semer = (parent: Noeud, liste: Categorie[]) => {
    for (const c of liste) semer(obtenir(parent, c.nom, true, c.icone), c.enfants);
  };
  semer(racine, contenu.categories);

  for (const f of contenu.fiches) {
    if (!f.analyse.meta) {
      illisibles.push(f);
      continue;
    }
    let n = racine;
    for (const s of f.analyse.meta.chemin) n = obtenir(n, s, false);
    n.fiches.push(f);
  }

  const trier = (n: Noeud) => {
    n.fiches.sort(
      (a, b) =>
        (a.analyse.meta!.ordre ?? 999) - (b.analyse.meta!.ordre ?? 999) ||
        a.analyse.meta!.titre.localeCompare(b.analyse.meta!.titre, 'fr', { numeric: true }),
    );
    n.enfants.forEach(trier);
  };
  racine.enfants.forEach(trier);
  return { racines: racine.enfants, illisibles };
}

/** Toutes les catégories, à plat, pour les listes de choix. */
export function cheminsDisponibles(racines: Noeud[]): string[][] {
  const sortie: string[][] = [];
  const parcourir = (n: Noeud) => {
    sortie.push(n.chemin);
    n.enfants.forEach(parcourir);
  };
  racines.forEach(parcourir);
  return sortie;
}

export const libelleChemin = (chemin: string[]) => chemin.join(' › ');

export function compterFiches(n: Noeud): number {
  return n.fiches.length + n.enfants.reduce((t, e) => t + compterFiches(e), 0);
}

/** L'arbre réduit à sa structure, pour réécrire categories.yml. */
export function arbreEnCategories(racines: Noeud[]): Categorie[] {
  return racines.map((n) => ({
    nom: n.nom,
    ...(n.icone ? { icone: n.icone } : {}),
    enfants: arbreEnCategories(n.enfants),
  }));
}

export function categoriesEnYaml(categories: Categorie[]): string {
  const nettoyer = (liste: Categorie[]): unknown[] =>
    liste.map((c) => ({
      nom: c.nom,
      ...(c.icone ? { icone: c.icone } : {}),
      ...(c.enfants.length ? { enfants: nettoyer(c.enfants) } : {}),
    }));
  return (
    '# Arborescence des catégories : ordre d\'affichage et catégories vides.\n' +
    '# Géré par l\'éditeur ; modifiable aussi à la main.\n' +
    YAML.stringify(nettoyer(categories), { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' })
  );
}

export function glossaireEnYaml(termes: Terme[]): string {
  const tries = [...termes].sort((a, b) => a.terme.localeCompare(b.terme, 'fr'));
  return (
    '# Glossaire : chaque terme est souligné automatiquement dans les cours.\n' +
    '# Géré par l\'éditeur ; modifiable aussi à la main.\n' +
    YAML.stringify(
      tries.map((t) => ({
        terme: t.terme,
        ...(t.formes.length ? { formes: t.formes } : {}),
        definition: t.definition,
      })),
      { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' },
    )
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Opérations sur l'arborescence
   ══════════════════════════════════════════════════════════════════════════ */

const commencePar = (chemin: string[], prefixe: string[]) =>
  prefixe.length <= chemin.length && prefixe.every((s, i) => memeNom(s, chemin[i]));

/** Réécrit une fiche avec un autre chemin, sans toucher à ses sections. */
export function avecChemin(f: FicheSource, chemin: string[]): string {
  const meta = f.analyse.meta!;
  return ecrire({ ...meta, chemin }, f.analyse.brut);
}

/** Trouve le nœud d'un chemin. */
export function trouver(racines: Noeud[], chemin: string[]): Noeud | null {
  let niveau = racines;
  let n: Noeud | null = null;
  for (const s of chemin) {
    n = niveau.find((e) => memeNom(e.nom, s)) ?? null;
    if (!n) return null;
    niveau = n.enfants;
  }
  return n;
}

/** Clone profond de la structure (sans les fiches), pour la modifier. */
function cloner(racines: Noeud[]): Noeud[] {
  return racines.map((n) => ({ ...n, enfants: cloner(n.enfants), fiches: n.fiches }));
}

export interface Modification {
  /** Fichiers à écrire (catégories et fiches déplacées). */
  ecritures: FichierSource[];
  message: string;
}

/** Ajoute une catégorie sous « parent » (ou à la racine). */
export function ajouterCategorie(racines: Noeud[], parent: string[], nom: string, icone?: string): Modification {
  nom = nom.trim();
  if (!nom) throw new Error('Donnez un nom à la catégorie.');
  if (/[›/]/.test(nom)) throw new Error('Le nom ne peut pas contenir « › » ni « / ».');
  const arbre = cloner(racines);
  const cible = parent.length ? trouver(arbre, parent) : null;
  const niveau = cible ? cible.enfants : arbre;
  if (niveau.some((e) => memeNom(e.nom, nom))) throw new Error(`« ${nom} » existe déjà à cet endroit.`);
  niveau.push({ nom, chemin: [...parent, nom], icone, declaree: true, enfants: [], fiches: [] });
  return {
    ecritures: [{ chemin: FICHIER_CATEGORIES, contenu: categoriesEnYaml(arbreEnCategories(arbre)) }],
    message: 'Ajoute une catégorie',
  };
}

/** Renomme une catégorie : réécrit categories.yml et le chemin des fiches concernées. */
export function renommerCategorie(racines: Noeud[], fiches: FicheSource[], chemin: string[], nouveau: string, icone?: string): Modification {
  nouveau = nouveau.trim();
  if (!nouveau) throw new Error('Donnez un nom à la catégorie.');
  if (/[›/]/.test(nouveau)) throw new Error('Le nom ne peut pas contenir « › » ni « / ».');
  const arbre = cloner(racines);
  const n = trouver(arbre, chemin);
  if (!n) throw new Error('Catégorie introuvable.');
  const freres = chemin.length > 1 ? trouver(arbre, chemin.slice(0, -1))!.enfants : arbre;
  if (!memeNom(n.nom, nouveau) && freres.some((e) => memeNom(e.nom, nouveau))) {
    throw new Error(`« ${nouveau} » existe déjà à cet endroit.`);
  }
  n.nom = nouveau;
  if (icone !== undefined) n.icone = icone || undefined;

  const nouveauChemin = [...chemin.slice(0, -1), nouveau];
  const ecritures: FichierSource[] = [{ chemin: FICHIER_CATEGORIES, contenu: categoriesEnYaml(arbreEnCategories(arbre)) }];
  const renomme = nouveau !== chemin[chemin.length - 1];
  if (renomme) {
    for (const f of fiches) {
      const c = f.analyse.meta?.chemin;
      if (!c || !commencePar(c, chemin)) continue;
      ecritures.push({ chemin: f.fichier, contenu: avecChemin(f, [...nouveauChemin, ...c.slice(chemin.length)]) });
    }
  }
  return { ecritures, message: renomme ? 'Renomme une catégorie' : 'Modifie une catégorie' };
}

/** Déplace une catégorie d'un cran parmi ses sœurs. */
export function deplacerCategorie(racines: Noeud[], chemin: string[], sens: -1 | 1): Modification | null {
  const arbre = cloner(racines);
  const freres = chemin.length > 1 ? trouver(arbre, chemin.slice(0, -1))!.enfants : arbre;
  const i = freres.findIndex((e) => memeNom(e.nom, chemin[chemin.length - 1]));
  const j = i + sens;
  if (i < 0 || j < 0 || j >= freres.length) return null;
  [freres[i], freres[j]] = [freres[j], freres[i]];
  return {
    ecritures: [{ chemin: FICHIER_CATEGORIES, contenu: categoriesEnYaml(arbreEnCategories(arbre)) }],
    message: 'Réordonne les catégories',
  };
}

/** Supprime une catégorie vide (sans fiche, sous-catégories comprises). */
export function supprimerCategorie(racines: Noeud[], chemin: string[]): Modification {
  const arbre = cloner(racines);
  const n = trouver(arbre, chemin);
  if (!n) throw new Error('Catégorie introuvable.');
  if (compterFiches(n)) {
    throw new Error('Cette catégorie contient encore des fiches : déplacez-les ou supprimez-les d\'abord.');
  }
  const freres = chemin.length > 1 ? trouver(arbre, chemin.slice(0, -1))!.enfants : arbre;
  freres.splice(freres.indexOf(n), 1);
  return {
    ecritures: [{ chemin: FICHIER_CATEGORIES, contenu: categoriesEnYaml(arbreEnCategories(arbre)) }],
    message: 'Supprime une catégorie',
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Fichiers
   ══════════════════════════════════════════════════════════════════════════ */

/** Nom de fichier opaque pour une nouvelle fiche, qui n'écrase rien. */
export function nouveauFichier(existants: Iterable<string>): string {
  const pris = new Set(existants);
  for (;;) {
    const octets = crypto.getRandomValues(new Uint8Array(6));
    const nom = `fiches/${Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('')}.md`;
    if (!pris.has(nom)) return nom;
  }
}

/** Nom lisible pour un téléchargement : « le-dol.md ». */
export function nomTelechargement(titre: string): string {
  const base = titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base || 'fiche'}.md`;
}

export function telecharger(nom: string, contenu: BlobPart, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Découpe un texte collé qui contient plusieurs fiches à la suite (ce que
 * produit souvent un assistant à qui l'on demande « fais-moi les fiches du
 * chapitre ») : chaque fiche commence par un en-tête « --- … titre: … --- ».
 */
export function decouperFichesCollees(texte: string): string[] {
  const propre = texte.replace(/\r\n?/g, '\n').replace(/^\s*```(?:markdown|md)?\s*\n/gim, '').replace(/\n```\s*$/gm, '\n');
  const lignes = propre.split('\n');
  const debuts: number[] = [];
  for (let i = 0; i < lignes.length; i++) {
    if (lignes[i].trim() !== '---') continue;
    // Un début de fiche : « --- » suivi, avant le « --- » fermant, d'un champ titre.
    let j = i + 1;
    let titre = false;
    while (j < lignes.length && lignes[j].trim() !== '---' && j - i < 30) {
      if (/^titre\s*:/.test(lignes[j])) titre = true;
      j++;
    }
    if (titre && j < lignes.length) {
      debuts.push(i);
      i = j;
    }
  }
  if (!debuts.length) return texte.trim() ? [texte.trim()] : [];
  return debuts.map((d, k) => lignes.slice(d, debuts[k + 1] ?? lignes.length).join('\n').trim());
}
