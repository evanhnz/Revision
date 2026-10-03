/**
 * Les sept dimensions perceptives, et leurs deux familles.
 *
 * La distinction vient de Stevens (1957). Une dimension **prothétique** répond à
 * « combien » : l'excitation s'y ajoute, et on la juge par estimation de
 * grandeur — intensité sonore, taille, durée, luminosité. Une dimension
 * **métathétique** répond à « où » ou « quel type » : l'excitation s'y déplace,
 * et on la juge par différence — hauteur, position, teinte.
 *
 * **La normalisation se fait ici, dans le jeu de stimuli, et non dans le score.**
 * C'est la décision de conception dont dépend toute la comparabilité des seuils.
 * Chaque dimension découpe sa plage utile en un même nombre de pas, choisis pour
 * être perceptivement réguliers : un seuil exprimé en pas est donc déjà sans
 * unité, et sept pas de taille se comparent directement à sept pas d'intensité
 * sonore. Normaliser après coup, en divisant par l'écart-type des performances,
 * aurait rendu la mesure mobile — un progrès sur une paire aurait déplacé le
 * score d'une paire jamais travaillée.
 *
 * « Perceptivement régulier » ne veut pas dire la même chose sur chaque
 * dimension, d'où les espacements différents ci-dessous : géométrique là où la
 * loi de Weber s'applique au stimulus physique (taille, durée, fréquence),
 * linéaire là où l'échelle est déjà perceptive (décibels, clarté L*, degrés de
 * teinte).
 */

export type Famille = 'prothetique' | 'metathetique';
export type Modalite = 'visuelle' | 'auditive';

export interface Dimension {
  id: string;
  nom: string;
  famille: Famille;
  /**
   * La modalité est un attribut du **rendu**, non de la dimension : une durée se
   * porte aussi bien par un son que par un clignotement. On fixe un rendu
   * canonique par dimension pour que le hub reste lisible, et ce sont les
   * couples de modalités différentes qui forment les routes transmodales.
   */
  modalite: Modalite;
  /** Une phrase, pour l'espace « Comprendre » et les consignes. */
  resume: string;
  /** Unité physique, pour le tableau de bord. */
  unite: string;
  /** La dimension reboucle-t-elle sur elle-même ? Seule la teinte le fait. */
  circulaire?: boolean;
  /** Valeur physique au pas donné, de 0 à PAS - 1. */
  valeur(pas: number): number;
}

/**
 * Nombre de pas par dimension. Cent vingt est assez fin pour qu'un seuil
 * expérimenté se loge dans les premiers pas, et assez grossier pour que chaque
 * pas reste au voisinage du discriminable.
 */
export const PAS = 120;

/** Interpolation linéaire entre deux bornes. */
const lineaire = (bas: number, haut: number) => (pas: number) =>
  bas + ((haut - bas) * pas) / (PAS - 1);

/** Interpolation géométrique : pas constants en rapport, non en différence. */
const geometrique = (bas: number, haut: number) => (pas: number) =>
  bas * Math.pow(haut / bas, pas / (PAS - 1));

export const DIMENSIONS: Dimension[] = [
  {
    id: 'taille',
    nom: 'Taille',
    famille: 'prothetique',
    modalite: 'visuelle',
    resume: 'Le diamètre d’un disque.',
    unite: 'px',
    // Loi de Weber : l'écart juste perceptible croît avec la taille, d'où des
    // pas géométriques.
    valeur: geometrique(10, 190),
  },
  {
    id: 'luminosite',
    nom: 'Luminosité',
    famille: 'prothetique',
    modalite: 'visuelle',
    resume: 'La clarté d’une pastille, du sombre au clair.',
    unite: 'L*',
    // L* est construite pour être perceptivement uniforme : pas linéaires.
    valeur: lineaire(12, 96),
  },
  {
    id: 'intensite',
    nom: 'Intensité sonore',
    famille: 'prothetique',
    modalite: 'auditive',
    resume: 'Le niveau d’un son, du faible au fort.',
    unite: 'dB',
    // Le décibel est déjà logarithmique : pas linéaires en dB.
    valeur: lineaire(-42, -3),
  },
  {
    id: 'duree',
    nom: 'Durée',
    famille: 'prothetique',
    modalite: 'auditive',
    resume: 'La longueur d’un son, du bref au tenu.',
    unite: 'ms',
    valeur: geometrique(70, 1400),
  },
  {
    id: 'hauteur',
    nom: 'Hauteur',
    famille: 'metathetique',
    modalite: 'auditive',
    resume: 'La hauteur d’un son, du grave à l’aigu.',
    unite: 'Hz',
    // Trois octaves : la hauteur perçue suit le logarithme de la fréquence.
    valeur: geometrique(220, 1760),
  },
  {
    id: 'position',
    nom: 'Position',
    famille: 'metathetique',
    modalite: 'visuelle',
    resume: 'Un repère le long d’une ligne, de gauche à droite.',
    unite: '%',
    valeur: lineaire(0, 100),
  },
  {
    id: 'teinte',
    nom: 'Teinte',
    famille: 'metathetique',
    modalite: 'visuelle',
    resume: 'La couleur d’une pastille, sur le cercle chromatique.',
    unite: '°',
    circulaire: true,
    // La teinte reboucle : 359° est voisin de 0°, ce dont l'écart entre deux
    // pas doit tenir compte — voir « ecartEnPas ».
    valeur: lineaire(0, 360 - 360 / PAS),
  },
];

export function dimensionParId(id: string): Dimension | undefined {
  return DIMENSIONS.find((dimension) => dimension.id === id);
}

export function dimensionsDeFamille(famille: Famille): Dimension[] {
  return DIMENSIONS.filter((dimension) => dimension.famille === famille);
}

export const NOMS_FAMILLES: Record<Famille, { nom: string; resume: string }> = {
  prothetique: {
    nom: 'Prothétique — « combien »',
    resume:
      'Des grandeurs qui s’additionnent : plus fort, plus grand, plus long, plus clair.',
  },
  metathetique: {
    nom: 'Métathétique — « où »',
    resume:
      'Des qualités qui se déplacent : plus aigu, plus à droite, une autre couleur.',
  },
};

/**
 * Écart entre deux pas, en pas, en tenant compte du rebouclage éventuel.
 *
 * Sur une dimension circulaire, le pas 2 et le pas 118 sont voisins : les
 * traiter comme distants de 116 fausserait aussi bien la génération d'un leurre
 * que la lecture d'un seuil.
 */
export function ecartEnPas(dimension: Dimension, a: number, b: number): number {
  const brut = Math.abs(a - b);
  return dimension.circulaire ? Math.min(brut, PAS - brut) : brut;
}

/** Ramène un pas dans les bornes, en rebouclant si la dimension le permet. */
export function borner(dimension: Dimension, pas: number): number {
  if (dimension.circulaire) return ((pas % PAS) + PAS) % PAS;
  return Math.max(0, Math.min(PAS - 1, pas));
}
