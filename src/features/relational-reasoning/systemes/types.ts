/**
 * Le contrat entre les deux couches de Relational Reasoning.
 *
 * Un **système** est un module de données : des entités, un vocabulaire de
 * relations, et la table qui dit comment deux relations se composent. Un
 * **moteur** est un générateur d'exercice qui reçoit un système en paramètre.
 *
 * Tout l'intérêt de la séparation tient à ce fichier : un moteur ne connaît
 * jamais un système en particulier, seulement ce contrat. Ajouter un système
 * donne donc des exercices dans tous les moteurs de son régime, sans écrire
 * une ligne de moteur.
 *
 * Voir « Phase 8 » dans PLAN.md pour les trois régimes d'inférence et la
 * raison pour laquelle « agnostique du système » ne vaut qu'à l'intérieur de
 * l'un d'eux.
 */

/**
 * L'algèbre abstraite qu'une relation instancie.
 *
 * C'est ce que le moteur Hidden Algebra demande de reconnaître : le motif des
 * arêtes suffit à distinguer un ordre d'une équivalence, sans que le verbe soit
 * nommé. Une relation qui n'en déclare aucune est simplement écartée de ce
 * moteur, plutôt que d'être rangée de force dans une case.
 */
export type AlgebreAbstraite =
  | 'ordre'
  | 'equivalence'
  | 'opposition'
  | 'cyclique'
  | 'adjacence'
  | 'succession'
  | 'ascendance';

/** Une relation du vocabulaire de surface d'un système. */
export interface Relation {
  /** Identifiant stable, utilisé dans les tables de composition. */
  id: string;
  /** « est à l'est de » — se lit après le sujet. */
  libelle: string;
  /** Forme courte pour les étiquettes de graphe et les cellules de tableau. */
  bref: string;
  /** L'algèbre abstraite instanciée, quand la relation en instancie une. */
  algebre?: AlgebreAbstraite;
}

/** Un fait énoncé : « sujet R objet ». */
export interface Fait {
  sujet: string;
  relation: string;
  objet: string;
}

/**
 * Un axe d'un système-produit.
 *
 * `plane` et `space` ne sont pas des tables plates de neuf ou vingt-sept
 * relations : ce sont les produits de deux et trois algèbres de points. C'est
 * cette formulation qui permet à « au nord de » composé avec « à l'est de » de
 * donner « au nord-est de » sans qu'aucune table ne l'énumère, et qui rend
 * naturels les moteurs qui effondrent ou échangent un axe.
 *
 * Le type est également la pièce que Veridical Mapping réutilise pour sa
 * dimension « position » (phase 9) : c'est l'abstraction d'axe qui est
 * partagée, pas le vocabulaire relationnel.
 */
export interface Axe {
  id: string;
  /** « ouest-est » — nomme l'axe, pas un sens. */
  libelle: string;
  /** Nombre de positions distinctes sur l'axe. */
  taille: number;
  /** Sens décroissant : « est à l'ouest de ». */
  versLeBas: string;
  /** Sens croissant : « est à l'est de ». */
  versLeHaut: string;
  /** Même position sur cet axe : « est sur la même colonne que ». */
  egal: string;
  /**
   * L'axe reboucle-t-il ? Faux partout en phase 8 ; la teinte de Veridical
   * Mapping s'en servira, et l'écart doit alors se mesurer sur le cercle.
   */
  circulaire?: boolean;
}

/**
 * Le régime d'inférence d'un système. Un moteur déclare les régimes qu'il sait
 * traiter ; l'interface ne propose jamais un couple incompatible.
 *
 * - `algebre` : l'inférence se fait par composition de relations.
 * - `clos` : seules les arêtes énoncées valent, l'absence d'arête est une
 *   négation et non une inconnue. `digraph` est dans ce cas, ce qui l'exclut
 *   des moteurs vivant de l'indétermination.
 * - `transformation` : l'état n'est pas un ensemble de faits mais une suite
 *   d'opérations, et la composition ne commute pas.
 */
export type Regime = 'algebre' | 'clos' | 'transformation';

/** Une instance d'exercice : des entités et les faits énoncés à leur sujet. */
export interface Instance {
  systeme: string;
  entites: string[];
  faits: Fait[];
  /**
   * Le modèle concret dont l'instance a été tirée, quand le système en a un
   * (coordonnées pour les systèmes-produits, camps pour `groups`). Les moteurs
   * s'en servent pour dessiner et pour vérifier une réponse ; il n'est jamais
   * montré tel quel.
   */
  modele?: Modele;
}

/** Le modèle concret sous-jacent à une instance. */
export interface Modele {
  /** Coordonnées par entité, un entier par axe. */
  coordonnees?: Record<string, number[]>;
  /** Étiquette de groupe par entité, pour les systèmes à camps. */
  camps?: Record<string, number>;
  /**
   * Les arêtes elles-mêmes, pour les systèmes du régime clos : `digraph` n'a
   * pas de structure sous-jacente dont les faits seraient une lecture
   * partielle, les faits *sont* le modèle.
   */
  aretes?: Fait[];
  /**
   * Clôture transitive de la précédence, pour `poset` : `apres[a]` liste tout
   * ce que `a` précède. La clôture est faite au tirage pour que la lecture
   * d'une paire soit un simple test d'appartenance.
   */
  apres?: Record<string, string[]>;
  /**
   * Les segments de la droite graduée, pour `allen` et `rcc8` : début et fin
   * par entité. Voir `noyaux/intervalles.ts`.
   */
  segments?: Record<string, { debut: number; fin: number }>;
}

export interface Systeme {
  id: string;
  nom: string;
  /** Une phrase : ce que le système représente. */
  resume: string;
  regimes: Regime[];
  relations: Relation[];
  /** Les axes, pour les systèmes-produits. Absent sinon. */
  axes?: Axe[];
  /**
   * Monde clos : l'absence de relation énoncée est une négation.
   *
   * `poset` est décrit comme clos par le cahier des charges, ce qui contredit
   * les moteurs qui demandent « quelles relations restent possibles ». D'où
   * deux préréglages du même module — voir PLAN.md, phase 8.
   */
  monde: 'clos' | 'ouvert';
  /** L'inverse d'une relation : si a R b alors b converse(R) a. */
  converse(relation: string): string;
  /**
   * Table de composition : les relations possibles entre a et c, sachant
   * a R b et b S c. Absente pour les systèmes du régime clos.
   */
  composer?(r: string, s: string): ReadonlySet<string>;
  /**
   * La cohérence par chemin décide-t-elle seule la question « quelles
   * relations sont encore possibles » ?
   *
   * Vrai pour l'algèbre de points et ses produits — donc pour `line`, `plane`
   * et `space` — ainsi que pour les algèbres fonctionnelles comme `groups`.
   * **Faux pour RCC8 et Allen**, où elle ne donne qu'un sur-ensemble : il faut
   * alors énumérer les scénarios cohérents pour obtenir la réponse exacte.
   */
  cheminComplet: boolean;
  /** Tire une instance de la difficulté demandée. */
  engendrer(difficulte: number, alea: Alea): Instance;
  /** La relation qui tient entre deux entités dans un modèle donné. */
  relationDansModele(modele: Modele, a: string, b: string): string;
  /** Comment l'interface doit présenter une instance. */
  rendu: 'graphe' | 'grille' | 'texte';
}

/** Générateur pseudo-aléatoire ensemencé — voir noyaux/aleatoire.ts. */
export interface Alea {
  /** Flottant dans [0, 1). */
  reel(): number;
  /** Entier dans [0, borne). */
  entier(borne: number): number;
  /** Un élément au hasard. */
  un<T>(liste: readonly T[]): T;
  /** Une copie mélangée. */
  melanger<T>(liste: readonly T[]): T[];
  /** `combien` éléments distincts, dans l'ordre du tirage. */
  plusieurs<T>(liste: readonly T[], combien: number): T[];
}
