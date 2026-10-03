/**
 * La rotation hebdomadaire des thèmes, et les jours de repos.
 *
 * Ce module existe séparément de `planification.ts` pour une raison précise :
 * la gamification a besoin de savoir quels jours sont des jours de repos — une
 * série de révisions ne doit pas se rompre parce qu'on a respecté son propre
 * planning — et `planification.ts` importe déjà la gamification. Tout mettre au
 * même endroit ferait un cycle d'imports.
 */
import {
  ecrireReglagesPlanification,
  jourISO,
  lireReglagesPlanification,
  toutesLesSeances,
  type ReglagesPlanification,
} from './db';

export interface ThemePlanification {
  id: string;
  nom: string;
  /** Nom court, pour les cases du calendrier. */
  court: string;
  icone: string;
  /** Matières du contenu rattachées à ce thème. */
  matieres: string[];
}

/*
   Les thèmes sont les matières du contenu : un thème par catégorie de premier
   niveau, défini au chargement du manifeste (voir « definirThemes »). Ajouter
   une matière dans l'éditeur la rend donc assignable à un jour sans toucher au
   code. Les tableaux sont modifiés sur place : les modules qui les ont importés
   voient la nouvelle liste.
*/
export const THEMES: ThemePlanification[] = [];

/** Identifiant stable d'un thème, tiré du nom de la matière. */
export function idTheme(nom: string): string {
  return (
    nom
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'matiere'
  );
}

function nomCourt(nom: string): string {
  if (nom.length <= 12) return nom;
  const mots = nom.split(/\s+/).filter((m) => !/^(de|du|des|la|le|les|d'|l')$/i.test(m));
  return mots.map((m, i) => (i === 0 ? m : `${m.slice(0, 4)}.`)).join(' ').slice(0, 16);
}

/** Remplace la liste des thèmes par les matières du manifeste. */
export function definirThemes(matieres: { nom: string; icone?: string }[]) {
  const nouveaux = matieres.map((m) => ({
    id: idTheme(m.nom),
    nom: m.nom,
    court: nomCourt(m.nom),
    icone: m.icone ?? '📘',
    matieres: [m.nom],
  }));
  THEMES.splice(0, THEMES.length, ...nouveaux);
  THEMES_ASSIGNABLES.splice(0, THEMES_ASSIGNABLES.length, ...nouveaux, REPOS);
}

/**
 * Le repos, traité comme un thème.
 *
 * Un jour sans révision n'est pas un trou dans le planning : c'est une décision,
 * et elle se pose exactement là où se posent les autres — dans la rotation
 * hebdomadaire pour un jour de repos régulier, sur une case du calendrier pour
 * une date précise. En faire un thème évite d'inventer un second mécanisme
 * d'assignation à côté du premier, et de tenir deux vérités sur le même jour.
 *
 * Il ne rattache aucune matière : aucune fiche, aucune carte, aucun rappel.
 */
export const REPOS: ThemePlanification = {
  id: 'repos',
  nom: 'Repos',
  court: 'Repos',
  icone: '🌙',
  matieres: [],
};

/** Les thèmes assignables à un jour : les matières, et le repos. */
export const THEMES_ASSIGNABLES: ThemePlanification[] = [REPOS];

export const theme = (id: string) => THEMES_ASSIGNABLES.find((t) => t.id === id);

export const estRepos = (themeId: string | null | undefined) => themeId === REPOS.id;

/** Libellés des jours, index 0 = dimanche, comme « Date.getDay() ». */
export const JOURS_SEMAINE = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

/**
 * Rotation par défaut : les matières se succèdent du lundi au samedi, le
 * dimanche est un jour de repos. Entièrement reconfigurable depuis la page de
 * planification, jours de repos compris.
 */
export function rotationParDefaut(): string[] {
  const rotation = [REPOS.id];
  for (let i = 0; i < 6; i++) rotation.push(THEMES.length ? THEMES[i % THEMES.length].id : REPOS.id);
  return rotation;
}

export function jourDeLaSemaine(jour: string): number {
  return new Date(`${jour}T12:00:00`).getDay();
}

export async function lireReglages(): Promise<ReglagesPlanification> {
  const stockes = await lireReglagesPlanification();
  const defaut = rotationParDefaut();
  if (!stockes) return { rotation: defaut, trimestreEcarte: null };
  // Un thème supprimé ou un tableau tronqué ne doit pas casser la rotation.
  const rotation = defaut.map((defaut, i) =>
    theme(stockes.rotation?.[i] ?? '') ? stockes.rotation[i] : defaut,
  );
  return { rotation, trimestreEcarte: stockes.trimestreEcarte ?? null };
}

export async function ecrireRotation(rotation: string[]) {
  const actuels = await lireReglages();
  await ecrireReglagesPlanification({ ...actuels, rotation });
}

/**
 * Le thème prévu pour un jour : celui d'une séance déjà posée, sinon la rotation.
 *
 * Une séance enregistrée fait foi — c'est elle que porte une réassignation, y
 * compris une mise au repos.
 */
export async function themeDuJour(jour = jourISO()): Promise<string> {
  const [reglages, seances] = await Promise.all([lireReglages(), toutesLesSeances()]);
  const existante = seances.find((s) => s.jour === jour);
  return existante?.theme ?? reglages.rotation[jourDeLaSemaine(jour)];
}

/** Le jour est-il un jour de repos — par la rotation ou par réassignation ? */
export async function jourDeRepos(jour = jourISO()): Promise<boolean> {
  return estRepos(await themeDuJour(jour));
}
