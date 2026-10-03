/**
 * Planification des révisions.
 *
 * La méthode suivie, fidèlement :
 *
 *   • sept thèmes pour sept jours — une matière par jour, en rotation, de
 *     sorte que chaque matière revienne une fois par semaine ;
 *   • chaque séance commence par restituer à blanc les séances n-2 puis n-1
 *     DE CETTE MATIÈRE — c'est-à-dire les deux dernières fois où ce thème est
 *     revenu dans la rotation, soit environ une et deux semaines plus tôt, et
 *     non les séances de la veille et de l'avant-veille sur d'autres thèmes ;
 *   • le 1er du mois, le rappel s'étend de n-1 à n-4, soit le dernier mois ;
 *   • tous les trois mois, une suggestion — et seulement une suggestion — de
 *     reprise des trois derniers mois.
 *
 * Point de robustesse : « n-1 » désigne la dernière séance RÉELLEMENT TERMINÉE
 * de la matière, pas un jour calculé au calendrier. Un jour sauté ne décale
 * donc rien : la séance précédente reste la séance précédente.
 */
import {
  ajouterJours,
  ecrireReglagesPlanification,
  ecrireSeance,
  jourISO,
  toutesLesSeances,
  type Seance,
} from './db';
import { gagnerXp } from './gamification';
import { jourDeLaSemaine, lireReglages, theme } from './rotation';
import type { Manifeste } from './contenu';

/*
   Les thèmes, la rotation hebdomadaire et les jours de repos vivent dans
   « rotation.ts » : la gamification en a besoin, et elle ne peut pas importer
   ce module-ci sans créer un cycle. Ils sont réexportés ici pour que les pages
   gardent une seule porte d'entrée.
*/
export {
  ecrireRotation,
  estRepos,
  JOURS_SEMAINE,
  jourDeLaSemaine,
  jourDeRepos,
  lireReglages,
  REPOS,
  rotationParDefaut,
  theme,
  themeDuJour,
  THEMES,
  THEMES_ASSIGNABLES,
  type ThemePlanification,
} from './rotation';

/* ══════════════════════════════════════════════════════════════════════════
   Calendrier
   ══════════════════════════════════════════════════════════════════════════ */

/** Vrai le 1er du mois : la séance du jour devient une séance étendue. */
export function estPremierDuMois(jour: string): boolean {
  return jour.slice(8, 10) === '01';
}

/** Trimestre civil d'un jour, sous la forme « 2026-T1 ». */
export function trimestre(jour: string): string {
  const mois = Number(jour.slice(5, 7));
  return `${jour.slice(0, 4)}-T${Math.floor((mois - 1) / 3) + 1}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Séances
   ══════════════════════════════════════════════════════════════════════════ */

export interface JourPlanifie {
  jour: string;
  /** Thème effectivement retenu : celui d'une séance déjà posée, sinon la rotation. */
  themeId: string;
  /** Séance enregistrée pour ce jour, s'il y en a une. */
  seance: Seance | null;
  /** Vrai si le thème a été réassigné à la main pour ce jour. */
  reassigne: boolean;
  etendue: boolean;
}

/** Vue d'une période : un élément par jour, passé ou à venir. */
export async function planning(debut: string, fin: string): Promise<JourPlanifie[]> {
  const reglages = await lireReglages();
  const seances = await toutesLesSeances();
  const parJour = new Map(seances.map((s) => [s.jour, s]));

  const resultat: JourPlanifie[] = [];
  for (let jour = debut; jour <= fin; jour = ajouterJours(jour, 1)) {
    const seance = parJour.get(jour) ?? null;
    const themeRotation = reglages.rotation[jourDeLaSemaine(jour)];
    resultat.push({
      jour,
      themeId: seance?.theme ?? themeRotation,
      seance,
      reassigne: Boolean(seance && seance.theme !== themeRotation),
      etendue: seance?.etendue ?? estPremierDuMois(jour),
    });
  }
  return resultat;
}

/** Séances terminées d'un thème, de la plus récente à la plus ancienne. */
export async function historique(themeId: string): Promise<Seance[]> {
  const seances = await toutesLesSeances();
  return seances
    .filter((s) => s.theme === themeId && s.statut === 'terminee')
    .sort((a, b) => b.jour.localeCompare(a.jour) || (b.id ?? 0) - (a.id ?? 0));
}

/**
 * Séances à restituer au début d'une séance : n-1, n-2 — et jusqu'à n-4 le
 * 1er du mois. L'ordre suit le déroulé décrit par la méthode : on commence
 * par la plus ancienne et on remonte jusqu'à la plus récente.
 */
export async function rappels(themeId: string, etendue: boolean, exclureId?: number) {
  const passees = (await historique(themeId)).filter((s) => s.id !== exclureId);
  const combien = etendue ? 4 : 2;
  return passees.slice(0, combien).reverse();
}

/** Séance du jour : celle déjà enregistrée, ou une séance neuve issue de la rotation. */
export async function seanceDuJour(jour = jourISO()): Promise<Seance> {
  const seances = await toutesLesSeances();
  const existante = seances.find((s) => s.jour === jour);
  if (existante) return existante;

  const reglages = await lireReglages();
  return {
    theme: reglages.rotation[jourDeLaSemaine(jour)],
    jour,
    statut: 'prevue',
    secondes: 0,
    note: '',
    restitutions: {},
    etendue: estPremierDuMois(jour),
  };
}

/** Enregistre une séance en cours, sans la terminer. */
export async function sauvegarder(seance: Seance): Promise<Seance> {
  const id = await ecrireSeance(seance);
  return { ...seance, id };
}

/**
 * Change le thème d'un jour donné — réassignation manuelle depuis le planning.
 * Une séance déjà terminée n'est pas réécrite : son thème fait partie de
 * l'historique sur lequel s'appuient les rappels n-1 et n-2.
 */
export async function reassigner(jour: string, themeId: string) {
  const seance = await seanceDuJour(jour);
  if (seance.statut === 'terminee') {
    throw new Error('Cette séance est déjà terminée : son thème ne peut plus être modifié.');
  }
  await ecrireSeance({ ...seance, theme: themeId, etendue: estPremierDuMois(jour) });
}

/** Échange les thèmes de deux jours — pour décaler une séance au lendemain. */
export async function echanger(jourA: string, jourB: string) {
  const [a, b] = await Promise.all([seanceDuJour(jourA), seanceDuJour(jourB)]);
  if (a.statut === 'terminee' || b.statut === 'terminee') {
    throw new Error('Une séance déjà terminée ne peut pas être échangée.');
  }
  await ecrireSeance({ ...a, theme: b.theme });
  await ecrireSeance({ ...b, theme: a.theme });
}

export interface ResultatSeance {
  seance: Seance;
  xpGagne: number;
  monteeDeNiveau: boolean;
}

/**
 * Clôture une séance : elle rejoint l'historique et alimente le système de
 * progression déjà en place — XP, série de jours, statistiques du jour. Aucun
 * compteur parallèle n'est tenu.
 */
export async function terminer(seance: Seance, secondes: number): Promise<ResultatSeance> {
  const terminee: Seance = {
    ...seance,
    statut: 'terminee',
    termineeLe: new Date().toISOString(),
    secondes: Math.max(seance.secondes, Math.round(secondes)),
  };
  const id = await ecrireSeance(terminee);

  const gain = await gagnerXp(xpSeance(terminee), { secondes: terminee.secondes });
  return { seance: { ...terminee, id }, xpGagne: gain.xpGagne, monteeDeNiveau: gain.monteeDeNiveau };
}

/**
 * XP d'une séance. La régularité prime : la séance rapporte d'abord parce
 * qu'elle a eu lieu, le reste récompense la restitution effective et la note
 * produite, qui sont le cœur de la méthode.
 */
export function xpSeance(seance: Seance): number {
  const restitutions = Object.values(seance.restitutions ?? {}).filter((t) => t.trim().length >= 80);
  const note = seance.note.trim().length;
  return (
    20 + // séance tenue
    restitutions.length * 8 + // chaque restitution à blanc réellement rédigée
    (note >= 1200 ? 20 : note >= 400 ? 10 : 0) + // note de séance d'une à deux pages
    (seance.etendue ? 10 : 0) // séance étendue du 1er du mois
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Suggestion trimestrielle
   ══════════════════════════════════════════════════════════════════════════ */

export interface SuggestionTrimestrielle {
  trimestre: string;
  /** Séances des trois derniers mois, toutes matières confondues. */
  seances: Seance[];
  depuis: string;
}

/**
 * Suggestion — et non obligation — de reprise des trois derniers mois.
 * Retourne « null » s'il n'y a rien à reprendre, ou si la suggestion du
 * trimestre en cours a déjà été écartée.
 */
export async function suggestionTrimestrielle(
  jour = jourISO(),
): Promise<SuggestionTrimestrielle | null> {
  const reglages = await lireReglages();
  const courant = trimestre(jour);
  if (reglages.trimestreEcarte === courant) return null;

  const depuis = ajouterJours(jour, -92);
  const seances = (await toutesLesSeances()).filter(
    (s) => s.statut === 'terminee' && s.jour >= depuis && s.jour <= jour,
  );
  // En deçà d'une poignée de séances, la suggestion n'aurait pas de matière.
  if (seances.length < 8) return null;
  return { trimestre: courant, seances, depuis };
}

export async function ecarterSuggestionTrimestrielle(jour = jourISO()) {
  const reglages = await lireReglages();
  await ecrireReglagesPlanification({ ...reglages, trimestreEcarte: trimestre(jour) });
}

/* ══════════════════════════════════════════════════════════════════════════
   Lien avec le contenu du site
   ══════════════════════════════════════════════════════════════════════════ */

export interface FicheProposee {
  id: string;
  titre: string;
  matiere: string;
  fascicule: string;
  /** La fiche propose-t-elle un prétest ? Voir `src/lib/pretest.ts`. */
  aPretest: boolean;
}

/**
 * Fiches de cours rattachées à un thème, dans l'ordre du programme.
 * C'est le « contenu du jour » proposé par la séance.
 */
export function fichesDuTheme(manifeste: Manifeste, themeId: string): FicheProposee[] {
  const cible = theme(themeId);
  if (!cible) return [];
  const noms = new Set(cible.matieres.map((m) => m.toLowerCase()));
  return manifeste.matieres
    .filter((m) => noms.has(m.nom.toLowerCase()))
    .flatMap((m) =>
      m.fascicules.flatMap((f) =>
        f.fiches.map((fiche) => ({
          id: fiche.id,
          titre: fiche.titre,
          matiere: m.nom,
          fascicule: f.nom,
          aPretest: fiche.aPretest ?? false,
        })),
      ),
    );
}
