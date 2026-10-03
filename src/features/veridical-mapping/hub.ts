/**
 * Le hub : toutes les paires entraînables d'une famille, et l'arbre couvrant.
 *
 * Une paire ne relie que deux dimensions de la **même famille**. C'est la règle
 * centrale du cahier des charges : on ne fait pas correspondre un « combien » à
 * un « où ». Voir PLAN.md, phase 9, pour ce que cette règle écarte — et pour
 * l'interrupteur qui permet de l'ouvrir en connaissance de cause.
 *
 * Les deux sens d'une paire sont suivis séparément, ce qui est la façon la plus
 * directe de mesurer la **bidirectionnalité** : le seuil de taille → intensité
 * et celui d'intensité → taille se lisent côte à côte.
 */
import { DIMENSIONS, dimensionsDeFamille, type Dimension, type Famille } from './dimensions';

export interface Arete {
  /** « taille>intensite » — la direction compte. */
  id: string;
  famille: Famille;
  de: Dimension;
  vers: Dimension;
  /** Vrai quand les deux dimensions n'ont pas la même modalité. */
  transmodale: boolean;
}

export function idArete(de: string, vers: string): string {
  return `${de}>${vers}`;
}

/** Identifiant de la paire sans sa direction, pour l'arbre couvrant. */
export function idPaire(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/** Toutes les arêtes orientées d'une famille. */
export function aretesDeFamille(famille: Famille): Arete[] {
  const dimensions = dimensionsDeFamille(famille);
  const aretes: Arete[] = [];
  for (const de of dimensions) {
    for (const vers of dimensions) {
      if (de.id === vers.id) continue;
      aretes.push({
        id: idArete(de.id, vers.id),
        famille,
        de,
        vers,
        transmodale: de.modalite !== vers.modalite,
      });
    }
  }
  return aretes;
}

/** Toutes les paires non orientées d'une famille. */
export function pairesDeFamille(famille: Famille): { a: Dimension; b: Dimension }[] {
  const dimensions = dimensionsDeFamille(famille);
  const paires: { a: Dimension; b: Dimension }[] = [];
  for (let i = 0; i < dimensions.length; i += 1) {
    for (let j = i + 1; j < dimensions.length; j += 1) {
      paires.push({ a: dimensions[i], b: dimensions[j] });
    }
  }
  return paires;
}

/**
 * Un arbre couvrant de la famille : le plus petit ensemble de paires reliant
 * toutes ses dimensions — trois paires pour les quatre dimensions prothétiques,
 * deux pour les trois métathétiques.
 *
 * L'arbre est construit par l'algorithme de Prim, en préférant à chaque pas la
 * paire la **moins travaillée**. Le squelette tire ainsi la personne vers les
 * liens neufs au lieu de repasser sur ceux qu'elle connaît déjà, et il change
 * d'une session à l'autre à mesure que l'entraînement avance : c'est bien un
 * squelette courant, et non un chemin figé.
 */
export function arbreCouvrant(
  famille: Famille,
  essaisDeLaPaire: (a: string, b: string) => number,
): { a: Dimension; b: Dimension }[] {
  const dimensions = dimensionsDeFamille(famille);
  if (dimensions.length < 2) return [];

  const atteintes = [dimensions[0]];
  const restantes = dimensions.slice(1);
  const arbre: { a: Dimension; b: Dimension }[] = [];

  while (restantes.length) {
    let meilleure: { a: Dimension; b: Dimension; poids: number } | null = null;
    for (const dedans of atteintes) {
      for (const dehors of restantes) {
        const poids = essaisDeLaPaire(dedans.id, dehors.id);
        if (!meilleure || poids < meilleure.poids) meilleure = { a: dedans, b: dehors, poids };
      }
    }
    if (!meilleure) break;
    arbre.push({ a: meilleure.a, b: meilleure.b });
    atteintes.push(meilleure.b);
    restantes.splice(restantes.indexOf(meilleure.b), 1);
  }
  return arbre;
}

/**
 * Les arêtes qui franchissent la frontière des familles.
 *
 * Elles sont **fermées par défaut**, comme le demande le cahier des charges :
 * on ne fait pas correspondre un « combien » à un « où ». La règle a pourtant un
 * coût qu'il faut connaître — elle écarte précisément hauteur ↔ taille et
 * hauteur ↔ luminosité, qui comptent parmi les correspondances transmodales les
 * mieux répliquées de la littérature, la hauteur étant métathétique quand la
 * taille et la luminosité sont prothétiques. D'où un interrupteur plutôt qu'une
 * impossibilité câblée, et un décompte séparé au tableau de bord pour que les
 * deux régimes ne se mélangent pas.
 */
export function aretesHorsFamille(): Arete[] {
  const aretes: Arete[] = [];
  for (const de of DIMENSIONS) {
    for (const vers of DIMENSIONS) {
      if (de.id === vers.id || de.famille === vers.famille) continue;
      aretes.push({
        id: idArete(de.id, vers.id),
        famille: de.famille,
        de,
        vers,
        transmodale: de.modalite !== vers.modalite,
      });
    }
  }
  return aretes;
}
