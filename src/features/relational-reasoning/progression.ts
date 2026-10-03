/**
 * Déblocage par famille, et une échelle de difficulté par moteur.
 *
 * Le premier jet séquençait la rubrique en quatre phases, chacune ouverte par un
 * total d'items réussis. Le défaut sautait aux yeux à l'usage : une personne à
 * l'aise en analogie devait accumuler des items d'induction pour accéder aux
 * analogies suivantes, puisque le compteur était global. Le modèle retenu
 * découple les deux axes.
 *
 *  - **Un moteur d'ouverture par famille** est accessible d'emblée ; les autres
 *    moteurs de la famille se débloquent sur la maîtrise de celui-là, et de lui
 *    seul.
 *  - **Chaque moteur monte sa propre échelle**, réglée par sa propre réussite.
 *  - **Les systèmes** apparaissent par paliers, selon l'ordre d'intuition du
 *    cahier des charges — c'est le seul compteur resté global, parce qu'il porte
 *    sur le vocabulaire et non sur les moteurs.
 *
 * Rien n'est mémorisé : tout se recalcule depuis l'historique des items. Une
 * valeur stockée se désynchroniserait d'un import de sauvegarde.
 */
import { accepte, MOTEURS, type Moteur } from './moteurs/index';
import type { Categorie } from './moteurs/types';
import { credit } from './noyaux/notation';
import { SYSTEMES, type Systeme } from './systemes/index';

/** Un item déjà joué, tel que la base le conserve. */
export interface Trace {
  moteur: string;
  systeme: string;
  /** Note de 0 à 1 — voir noyaux/notation.ts. */
  note: number;
}

export interface Famille {
  id: Categorie;
  nom: string;
  resume: string;
  /** Le moteur accessible d'emblée, et dont la maîtrise ouvre les autres. */
  ouverture: string;
}

export const FAMILLES: Famille[] = [
  {
    id: 'isomorphisme',
    nom: 'Isomorphisme et algèbre',
    resume: 'Reconnaître qu’une structure est la même sous d’autres noms.',
    ouverture: 'algebre-cachee',
  },
  {
    id: 'analogie',
    nom: 'Analogie',
    resume: 'Transporter une relation d’un couple à un autre.',
    ouverture: 'completion-analogie',
  },
  {
    id: 'incompletude',
    nom: 'Information incomplète',
    resume: 'Dire ce qui reste possible quand l’énoncé ne tranche pas.',
    ouverture: 'ensembles-possibles',
  },
  {
    id: 'algebres',
    nom: 'Autres algèbres',
    resume: 'Des relations qui ne se composent pas comme on s’y attend.',
    ouverture: 'entre-deux',
  },
];

/**
 * Les moteurs d'induction accompagnent dès le départ. Ils sont plus simples et
 * servent d'entrée en matière, sans condition de déblocage : c'est la place que
 * leur donne le cahier des charges.
 */
const FAMILLE_LIBRE: Categorie = 'induction';

/** Paliers d'apparition des systèmes, et items réussis nécessaires. */
export const PALIERS_SYSTEMES: { systemes: string[]; seuil: number; nom: string }[] = [
  { systemes: ['line', 'plane', 'groups'], seuil: 0, nom: 'Ligne, plan, équipes' },
  { systemes: ['digraph', 'poset', 'poset-ouvert'], seuil: 30, nom: 'Réseaux dirigés et ordres partiels' },
  { systemes: ['space', 'cyclic'], seuil: 70, nom: 'Espace et dominance cyclique' },
  { systemes: ['rcc8', 'allen'], seuil: 130, nom: 'Régions et intervalles' },
];

/** Conditions de maîtrise du moteur d'ouverture d'une famille. */
const MAITRISE = { items: 12, fenetre: 20, taux: 0.75 };

export interface EtatMoteur {
  moteur: Moteur;
  ouvert: boolean;
  /** Échelon courant, de 1 à 10. */
  echelon: number;
  items: number;
  taux: number;
}

/**
 * L'échelon d'un moteur, rejoué depuis son historique.
 *
 * Trois réponses exactes d'affilée au même échelon le font monter d'un cran ;
 * une réponse fausse retire un crédit, et deux fautes consécutives font
 * redescendre. Une réponse partielle maintient — voir `credit`.
 *
 * Le rejeu plutôt qu'un compteur stocké : l'échelon se refait à l'identique
 * après un import de sauvegarde, et un défaut de la règle se corrige sans avoir
 * à réparer des données.
 */
export function echelonDeMoteur(traces: readonly Trace[], moteurId: string): number {
  let echelon = 1;
  let credits = 0;
  let fautesDeSuite = 0;

  for (const trace of traces) {
    if (trace.moteur !== moteurId) continue;
    const valeur = credit(trace.note);
    if (valeur > 0) {
      fautesDeSuite = 0;
      credits += 1;
      if (credits >= 3) {
        credits = 0;
        echelon = Math.min(10, echelon + 1);
      }
    } else if (valeur < 0) {
      credits = Math.max(0, credits - 1);
      fautesDeSuite += 1;
      if (fautesDeSuite >= 2) {
        fautesDeSuite = 0;
        echelon = Math.max(1, echelon - 1);
      }
    }
  }
  return echelon;
}

/** Nombre d'items joués sur un moteur, et taux de réussite sur les derniers. */
export function bilanDeMoteur(traces: readonly Trace[], moteurId: string) {
  const siennes = traces.filter((trace) => trace.moteur === moteurId);
  const recentes = siennes.slice(-MAITRISE.fenetre);
  const taux = recentes.length
    ? recentes.reduce((somme, trace) => somme + trace.note, 0) / recentes.length
    : 0;
  return { items: siennes.length, taux };
}

/** Le moteur d'ouverture d'une famille est-il maîtrisé ? */
export function familleDebloquee(traces: readonly Trace[], famille: Famille): boolean {
  const bilan = bilanDeMoteur(traces, famille.ouverture);
  return bilan.items >= MAITRISE.items && bilan.taux >= MAITRISE.taux;
}

/** Items entièrement réussis, tous moteurs confondus. */
export function itemsReussis(traces: readonly Trace[]): number {
  return traces.filter((trace) => trace.note >= 1).length;
}

/** Les systèmes dont le palier est atteint. */
export function systemesOuverts(traces: readonly Trace[]): Set<string> {
  const reussis = itemsReussis(traces);
  return new Set(
    PALIERS_SYSTEMES.filter((palier) => reussis >= palier.seuil).flatMap((p) => p.systemes),
  );
}

/** Le prochain palier de systèmes, ou `null` si tous sont ouverts. */
export function prochainPalierSystemes(traces: readonly Trace[]) {
  const reussis = itemsReussis(traces);
  const suivant = PALIERS_SYSTEMES.find((palier) => reussis < palier.seuil);
  return suivant ? { palier: suivant, reste: suivant.seuil - reussis } : null;
}

/** L'état de chaque moteur écrit : ouvert ou non, échelon, historique. */
export function etatDesMoteurs(traces: readonly Trace[]): EtatMoteur[] {
  const debloquees = new Set(
    FAMILLES.filter((famille) => familleDebloquee(traces, famille)).map((f) => f.id),
  );

  return MOTEURS.map((moteur) => {
    const famille = FAMILLES.find((f) => f.id === moteur.categorie);
    const ouvert =
      moteur.categorie === FAMILLE_LIBRE ||
      !famille ||
      famille.ouverture === moteur.id ||
      debloquees.has(moteur.categorie);
    const bilan = bilanDeMoteur(traces, moteur.id);
    return { moteur, ouvert, echelon: echelonDeMoteur(traces, moteur.id), ...bilan };
  });
}

/** Les couples praticables : moteur ouvert, système au palier, et compatibles. */
export function couplesOuverts(
  traces: readonly Trace[],
): { moteur: Moteur; systeme: Systeme; echelon: number }[] {
  const ouverts = systemesOuverts(traces);
  const resultat: { moteur: Moteur; systeme: Systeme; echelon: number }[] = [];

  for (const etat of etatDesMoteurs(traces)) {
    if (!etat.ouvert) continue;
    for (const systeme of SYSTEMES) {
      if (!ouverts.has(systeme.id)) continue;
      if (accepte(etat.moteur, systeme)) {
        resultat.push({ moteur: etat.moteur, systeme, echelon: etat.echelon });
      }
    }
  }
  return resultat;
}

/** Le bilan d'un système : items joués et note moyenne, tous moteurs confondus. */
export function bilanDeSysteme(traces: readonly Trace[], systemeId: string) {
  const siennes = traces.filter((trace) => trace.systeme === systemeId);
  const moyenne = siennes.length
    ? siennes.reduce((somme, trace) => somme + trace.note, 0) / siennes.length
    : 0;
  return { items: siennes.length, moyenne, reussis: siennes.filter((t) => t.note >= 1).length };
}

/**
 * Statistiques complètes, pour le panneau de progression.
 *
 * Deux vues, et elles ne disent pas la même chose. Par **moteur**, on lit où l'on
 * en est d'une compétence : quel échelon, quel taux récent. Par **système**, on
 * lit sur quel vocabulaire on se trompe — et c'est l'information la plus utile,
 * parce qu'un taux qui s'effondre sur `allen` alors qu'il tient sur `line` ne
 * signale pas une faiblesse de raisonnement mais une algèbre mal comprise.
 *
 * Le taux affiché est une **moyenne de notes**, non une proportion de réussites :
 * sur les moteurs à sélection multiple, une réponse partielle vaut entre zéro et
 * un, et l'écraser en « raté » perdrait précisément ce que le barème cherche à
 * mesurer.
 */
export interface Statistiques {
  items: number;
  reussis: number;
  moyenne: number;
  /** Par moteur ouvert, dans l'ordre des familles. */
  parMoteur: { moteur: Moteur; echelon: number; items: number; taux: number }[];
  /** Par système rencontré, du plus joué au moins joué. */
  parSysteme: { systeme: Systeme; items: number; reussis: number; moyenne: number }[];
  /** Familles débloquées, et ce qu'il reste à faire pour les autres. */
  parFamille: {
    famille: Famille;
    debloquee: boolean;
    /** Items restants sur le moteur d'ouverture, et taux atteint. */
    resteItems: number;
    taux: number;
  }[];
}

export function statistiques(traces: readonly Trace[]): Statistiques {
  const etats = etatDesMoteurs(traces);
  const ouverts = systemesOuverts(traces);

  const parSysteme = SYSTEMES.filter((systeme) => ouverts.has(systeme.id))
    .map((systeme) => ({ systeme, ...bilanDeSysteme(traces, systeme.id) }))
    .filter((ligne) => ligne.items > 0)
    .sort((a, b) => b.items - a.items);

  const parFamille = FAMILLES.map((famille) => {
    const bilan = bilanDeMoteur(traces, famille.ouverture);
    return {
      famille,
      debloquee: familleDebloquee(traces, famille),
      resteItems: Math.max(0, MAITRISE.items - bilan.items),
      taux: bilan.taux,
    };
  });

  return {
    items: traces.length,
    reussis: itemsReussis(traces),
    moyenne: traces.length ? traces.reduce((s, t) => s + t.note, 0) / traces.length : 0,
    parMoteur: etats
      .filter((etat) => etat.ouvert && etat.items > 0)
      .map(({ moteur, echelon, items, taux }) => ({ moteur, echelon, items, taux })),
    parSysteme,
    parFamille,
  };
}

/** Les conditions de maîtrise, exposées pour que l'interface les annonce. */
export const CONDITIONS_MAITRISE = MAITRISE;
