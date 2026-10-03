/**
 * Ce qu'un moteur produit, et rien de plus.
 *
 * Tous les moteurs — les trente du cahier des charges — rendent le même type
 * d'`Item`. C'est ce qui permet à un seul jeu de composants de les afficher
 * tous, et à la session de compter les réussites sans savoir de quel moteur
 * elles viennent. Un moteur qui aurait besoin d'un affichage propre ajoute une
 * variante de `Bloc`, jamais un composant de session.
 */
import type { Alea, Axe, Regime, Systeme } from '../systemes/types';

/** Un morceau affichable d'énoncé ou d'option. */
export type Bloc =
  | { type: 'texte'; texte: string }
  /** Des faits déjà mis en français : « A est à l'est de B ». */
  | { type: 'faits'; phrases: string[] }
  /** Une position par entité sur les axes d'un système-produit. */
  | {
      type: 'grille';
      axes: Axe[];
      points: { etiquette: string; coord: number[] }[];
      /** Entités à faire ressortir — la paire interrogée, par exemple. */
      souligne?: string[];
    }
  /** Un réseau d'arêtes étiquetées. */
  | {
      type: 'graphe';
      noeuds: string[];
      aretes: { de: string; a: string; libelle: string; sorte?: 'positif' | 'negatif' }[];
      /** L'arête à deviner, tracée en pointillés. */
      manquante?: { de: string; a: string };
    }
  | { type: 'tableau'; entetes: string[]; lignes: string[][] };

/** Une option de réponse : du texte, un dessin, ou les deux. */
export interface Option {
  texte?: string;
  blocs?: Bloc[];
}

export type Reponse =
  | { genre: 'unique'; options: Option[]; bonne: number }
  /**
   * Plusieurs bonnes réponses. C'est le format des moteurs qui demandent
   * « toutes les relations encore possibles » : la réponse *est* un ensemble,
   * et n'accepter qu'un élément trahirait la question.
   */
  | { genre: 'multiple'; options: Option[]; bonnes: number[] }
  /** Chaque élément de gauche va avec un élément de droite. */
  | {
      genre: 'appariement';
      gauche: string[];
      droite: string[];
      paires: Record<string, string>;
    };

export interface Item {
  moteur: string;
  systeme: string;
  /** Ce que l'on demande, en une phrase. */
  consigne: string;
  enonce: Bloc[];
  reponse: Reponse;
  /** Montrée après correction : le raisonnement, non le seul verdict. */
  explication: string;
  /**
   * Second temps facultatif, posé une fois le premier corrigé. Hidden Algebra
   * s'en sert pour demander de prédire une relation non montrée sous l'algèbre
   * qui vient d'être identifiée.
   */
  suite?: {
    consigne: string;
    enonce: Bloc[];
    reponse: Reponse;
    explication: string;
  };
}

export type Categorie = 'isomorphisme' | 'analogie' | 'incompletude' | 'algebres' | 'induction';

export interface Moteur {
  id: string;
  nom: string;
  categorie: Categorie;
  /** Une phrase : ce que le moteur demande de faire. */
  resume: string;
  /** Les régimes d'inférence dans lesquels le moteur sait travailler. */
  regimes: Regime[];
  /**
   * Filtre plus fin que le régime, quand il le faut. `groups` appartient au
   * régime algébrique mais sa composition est fonctionnelle : aucune paire n'y
   * reste ouverte, ce qui le rend inutilisable pour les moteurs
   * d'indétermination sans qu'aucun régime ne le dise.
   */
  compatible?(systeme: Systeme): boolean;
  /**
   * Rend `null` quand le tirage ne donne pas d'item valide — structure trop
   * symétrique pour avoir une réponse unique, indétermination absente là où
   * elle est nécessaire. La session retire alors une autre graine plutôt que de
   * poser une question douteuse.
   */
  engendrer(systeme: Systeme, difficulte: number, alea: Alea): Item | null;
}

/** Un moteur peut-il tourner sur un système ? */
export function accepte(moteur: Moteur, systeme: Systeme): boolean {
  if (!moteur.regimes.some((regime) => systeme.regimes.includes(regime))) return false;
  return moteur.compatible ? moteur.compatible(systeme) : true;
}
