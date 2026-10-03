/**
 * L'escalier adaptatif : un seuil de discrimination par paire, plutôt qu'un
 * pourcentage de bonnes réponses.
 *
 * Procédure **2-down-1-up** : deux réponses justes de suite resserrent l'écart
 * entre les deux candidats, une erreur l'élargit. Elle converge vers le point
 * où la personne réussit 70,7 % des essais, ce qui est la valeur classique de
 * cette règle en choix forcé à deux alternatives — bien au-dessus du hasard, qui
 * est ici de 50 %.
 *
 * Le pas est **géométrique** et se resserre à mesure que l'escalier tourne :
 * facteur 2 au départ, 1,41 après deux inversions, 1,19 après quatre. On
 * approche vite, puis on affine.
 *
 * Le seuil est la moyenne géométrique des écarts aux six dernières inversions,
 * et il faut au moins huit inversions pour qu'il soit rendu : les premières
 * servent à descendre depuis l'écart initial et ne disent rien du seuil.
 *
 * Ces valeurs sont miennes et non reprises d'un outil existant : la politique
 * réseau de l'environnement interdisant l'accès à l'outil de référence, elles
 * viennent de la pratique psychophysique courante. Elles sont rassemblées ici
 * pour être ajustées d'un seul endroit.
 */
import { PAS } from './dimensions';

export const REGLAGES = {
  /** Écart initial, en pas : largement au-dessus de tout seuil plausible. */
  departDelta: 36,
  deltaMinimum: 1,
  deltaMaximum: Math.floor(PAS / 2),
  /** Facteur appliqué à l'écart, selon le nombre d'inversions déjà faites. */
  facteurs: [
    { apres: 0, facteur: 2 },
    { apres: 2, facteur: 1.41 },
    { apres: 4, facteur: 1.19 },
  ],
  /** Inversions retenues pour le calcul du seuil. */
  inversionsRetenues: 6,
  /** Inversions nécessaires avant de rendre un seuil. */
  inversionsRequises: 8,
  /** Écart-type maximal du log des dernières inversions, pour la convergence. */
  dispersionMaximale: 0.1,
} as const;

export type Statut = 'jamais' | 'en-cours' | 'converge';

export interface EtatEscalier {
  /** Écart courant entre le bon candidat et le leurre, en pas. */
  delta: number;
  /** Bonnes réponses consécutives depuis le dernier changement d'écart. */
  bonnesDeSuite: number;
  /** Écarts relevés à chaque inversion, dans l'ordre. */
  inversions: number[];
  /** Sens du dernier changement d'écart. */
  derniereDirection: 'resserre' | 'elargit' | null;
  essais: number;
  reussis: number;
}

export function escalierNeuf(): EtatEscalier {
  return {
    delta: REGLAGES.departDelta,
    bonnesDeSuite: 0,
    inversions: [],
    derniereDirection: null,
    essais: 0,
    reussis: 0,
  };
}

function facteurCourant(inversions: number): number {
  let facteur: number = REGLAGES.facteurs[0].facteur;
  for (const palier of REGLAGES.facteurs) if (inversions >= palier.apres) facteur = palier.facteur;
  return facteur;
}

/**
 * Enregistre une réponse et rend le nouvel état.
 *
 * L'inversion est relevée **au moment où le sens change**, et l'écart consigné
 * est celui qui précède le changement : c'est le point de rebroussement, et
 * c'est lui qui encadre le seuil.
 */
export function repondre(etat: EtatEscalier, juste: boolean): EtatEscalier {
  const suivant: EtatEscalier = {
    ...etat,
    inversions: [...etat.inversions],
    essais: etat.essais + 1,
    reussis: etat.reussis + (juste ? 1 : 0),
  };

  if (juste) {
    suivant.bonnesDeSuite = etat.bonnesDeSuite + 1;
    // Deux bonnes de suite avant de resserrer : c'est ce qui fait la règle
    // « 2-down » et place le point de convergence à 70,7 %.
    if (suivant.bonnesDeSuite < 2) return suivant;
    suivant.bonnesDeSuite = 0;
    if (etat.derniereDirection === 'elargit') suivant.inversions.push(etat.delta);
    suivant.derniereDirection = 'resserre';
    suivant.delta = Math.max(
      REGLAGES.deltaMinimum,
      etat.delta / facteurCourant(suivant.inversions.length),
    );
    return suivant;
  }

  suivant.bonnesDeSuite = 0;
  if (etat.derniereDirection === 'resserre') suivant.inversions.push(etat.delta);
  suivant.derniereDirection = 'elargit';
  suivant.delta = Math.min(
    REGLAGES.deltaMaximum,
    etat.delta * facteurCourant(suivant.inversions.length),
  );
  return suivant;
}

/** Les dernières inversions retenues pour le seuil. */
function dernieres(etat: EtatEscalier): number[] {
  return etat.inversions.slice(-REGLAGES.inversionsRetenues);
}

/**
 * Le seuil, en pas — donc directement comparable d'une dimension à l'autre,
 * puisque la normalisation est dans le jeu de stimuli. Rend `null` tant que les
 * inversions requises ne sont pas atteintes.
 */
export function seuil(etat: EtatEscalier): number | null {
  if (etat.inversions.length < REGLAGES.inversionsRequises) return null;
  const retenues = dernieres(etat);
  const somme = retenues.reduce((total, valeur) => total + Math.log(valeur), 0);
  return Math.exp(somme / retenues.length);
}

/** Dispersion des dernières inversions, en log décimal. */
export function dispersion(etat: EtatEscalier): number | null {
  const retenues = dernieres(etat);
  if (retenues.length < REGLAGES.inversionsRetenues) return null;
  const logs = retenues.map((valeur) => Math.log10(valeur));
  const moyenne = logs.reduce((total, valeur) => total + valeur, 0) / logs.length;
  const variance =
    logs.reduce((total, valeur) => total + (valeur - moyenne) ** 2, 0) / logs.length;
  return Math.sqrt(variance);
}

export function statut(etat: EtatEscalier): Statut {
  if (!etat.essais) return 'jamais';
  const ecart = dispersion(etat);
  if (
    etat.inversions.length >= REGLAGES.inversionsRequises &&
    ecart !== null &&
    ecart <= REGLAGES.dispersionMaximale
  ) {
    return 'converge';
  }
  return 'en-cours';
}

export const INTITULES_STATUT: Record<Statut, string> = {
  jamais: 'jamais travaillée',
  'en-cours': 'en cours',
  converge: 'stabilisée',
};
