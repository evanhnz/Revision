/**
 * Un stimulus concret : ce qu'il faut montrer ou jouer pour un pas donné.
 *
 * Une seule dimension varie à la fois ; toutes les autres prennent une valeur
 * fixe. C'est indispensable à la validité de la mesure — si la hauteur variait
 * en même temps que l'intensité, le seuil mesuré ne porterait sur aucune des
 * deux.
 */
import { type Dimension, type Modalite } from './dimensions';

/** Valeurs des dimensions qui ne varient pas dans un essai donné. */
export const FIXES = {
  taillePx: 84,
  clarte: 62,
  teinte: 210,
  positionPct: 50,
  frequenceHz: 440,
  niveauDb: -14,
  dureeMs: 360,
} as const;

export interface Stimulus {
  dimension: string;
  modalite: Modalite;
  taillePx: number;
  /** Clarté L*, de 0 à 100. */
  clarte: number;
  /** Teinte en degrés. */
  teinte: number;
  /** Position le long de la ligne, en pourcentage. */
  positionPct: number;
  frequenceHz: number;
  niveauDb: number;
  dureeMs: number;
}

export function stimulus(dimension: Dimension, pas: number): Stimulus {
  const valeur = dimension.valeur(pas);
  const base: Stimulus = {
    dimension: dimension.id,
    modalite: dimension.modalite,
    ...FIXES,
  };
  switch (dimension.id) {
    case 'taille':
      return { ...base, taillePx: valeur };
    case 'luminosite':
      return { ...base, clarte: valeur };
    case 'teinte':
      return { ...base, teinte: valeur };
    case 'position':
      return { ...base, positionPct: valeur };
    case 'hauteur':
      return { ...base, frequenceHz: valeur };
    case 'intensite':
      return { ...base, niveauDb: valeur };
    case 'duree':
      return { ...base, dureeMs: valeur };
    default:
      return base;
  }
}

/**
 * Superpose deux stimulus visuels en un seul.
 *
 * C'est ce que demande la tâche « plan » : une référence n'y est pas une valeur
 * sur une dimension mais un **couple** de valeurs sur deux dimensions, porté par
 * un seul objet — un disque à la fois grand et clair, par exemple.
 *
 * La superposition n'est possible que parce que chaque dimension ne touche qu'un
 * attribut de `Stimulus`. On part donc du premier et l'on n'écrase que l'attribut
 * du second, ce qui rend l'opération sûre sans qu'il faille énumérer les couples.
 * Deux dimensions qui se disputeraient le même attribut produiraient un stimulus
 * où la seconde effacerait la première — d'où la vérification de `compatibles`,
 * qui écarte ces couples au tirage plutôt que de les rendre indistinguables.
 */
export function superposer(premier: Stimulus, second: Stimulus): Stimulus {
  const fusion: Stimulus = { ...premier };
  const attributs: (keyof typeof FIXES)[] = [
    'taillePx',
    'clarte',
    'teinte',
    'positionPct',
    'frequenceHz',
    'niveauDb',
    'dureeMs',
  ];
  for (const attribut of attributs) {
    // Seul l'attribut que le second stimulus a fait varier est reporté.
    if (second[attribut] !== FIXES[attribut]) fusion[attribut] = second[attribut];
  }
  fusion.dimension = `${premier.dimension}+${second.dimension}`;
  // La modalité du couple est auditive dès qu'un des deux l'est : il faudra
  // jouer un son, et l'interface doit le savoir.
  fusion.modalite = premier.modalite === 'auditive' || second.modalite === 'auditive'
    ? 'auditive'
    : 'visuelle';
  return fusion;
}

/**
 * Deux dimensions peuvent-elles être superposées sans se recouvrir ?
 *
 * Elles ne peuvent pas si elles pilotent le même attribut — ce qui n'arrive pas
 * dans le catalogue actuel, chaque dimension ayant le sien — ni si elles sont
 * toutes deux auditives : deux sons superposés ne se distinguent pas à l'écoute
 * comme deux attributs d'un même disque se distinguent à l'œil. La restriction
 * est perceptive, non technique, et c'est la raison de la nommer ici plutôt que
 * de la laisser se deviner à l'usage.
 */
export function superposables(a: Dimension, b: Dimension): boolean {
  if (a.id === b.id) return false;
  if (a.modalite === 'auditive' && b.modalite === 'auditive') return false;
  return true;
}
