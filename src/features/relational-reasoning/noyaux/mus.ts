/**
 * Sous-ensembles insatisfiables minimaux — troisième des huit noyaux.
 *
 * Il sert trois moteurs de la catégorie « information incomplète » :
 *
 *  - **Contradiction** : quel fait retirer pour rétablir la cohérence ?
 *  - **Prémisses minimales** : quels faits suffisent à forcer la conclusion ?
 *  - **Prémisse manquante** : quel fait ajouter pour que la conclusion suive ?
 *
 * Un point de vocabulaire, car il porte toute la correction : un ensemble de
 * faits *entraîne* une relation r entre a et b lorsque r est **la seule**
 * relation encore possible entre eux. « Possible » se calcule par le noyau de
 * cohérence, qui sait à quelles algèbres la propagation seule suffit.
 *
 * Ce noyau a longtemps énuméré les sous-ensembles par taille croissante, en
 * jugeant l'exponentielle acceptable « à cette échelle ». La mesure a démenti :
 * douze faits font 4 096 sous-ensembles, et un test d'entraînement coûte une
 * propagation complète — quelques microsecondes sur une algèbre de points,
 * plusieurs millisecondes sur RCC8 ou Allen, où l'énumération exacte remplace la
 * propagation. Un item de « Prémisses minimales » sur RCC8 demandait **dix-neuf
 * secondes**. Ce n'était pas le nombre de sous-ensembles qui avait été mal
 * estimé, mais le prix d'un seul test.
 *
 * L'énumération est donc remplacée par une caractérisation exacte, qui coûte un
 * nombre de tests *linéaire*. Appelons un fait **nécessaire** lorsque
 * l'ensemble entier privé de ce seul fait n'entraîne plus la conclusion, et
 * notons N l'ensemble des faits nécessaires. Alors :
 *
 *  1. Tout sous-ensemble suffisant contient N. Car la suffisance est croissante
 *     (ajouter des faits ne retire pas de conclusion) : si un sous-ensemble
 *     suffisant S omettait un fait nécessaire f, alors S ⊆ faits∖{f} serait
 *     suffisant, donc faits∖{f} le serait aussi — c'est la définition contredite.
 *  2. Donc si N est lui-même suffisant, c'est **l'unique** sous-ensemble
 *     suffisant minimal, et le plus petit.
 *  3. Et si N n'est pas suffisant, il y en a au moins deux : tout minimal
 *     contient N strictement, et s'il n'y en avait qu'un, disons M, tout
 *     suffisant contiendrait M, donc chaque fait de M serait nécessaire, donc
 *     M ⊆ N — ce qui contredit N ⊊ M.
 *
 * L'unicité se décide donc en |faits| + 1 tests au lieu de 2^|faits|, sans rien
 * approcher : la suite d'essais vérifie l'accord avec l'énumération exhaustive
 * sur les systèmes où celle-ci reste abordable.
 *
 * Ce changement resserre aussi une **faute de correction**. L'ancienne version
 * ne comptait les concurrents qu'à taille égale : deux chaînes indépendantes de
 * tailles 2 et 3 lui passaient pour « uniques », et l'explication affichée
 * — « retirer l'un des faits qui comptent rend la conclusion indéterminée » —
 * était alors fausse, puisque la seconde chaîne la forçait toujours. La
 * caractérisation ci-dessus est exactement l'énoncé que l'explication prétend
 * faire : les faits rendus sont ceux dont le retrait, à lui seul, fait perdre la
 * conclusion.
 */
import type { Fait } from '../systemes/types';
import { coherent, possibilites, possibilitesParChemin, type Algebre } from './algebre';

/** Au-delà, l'énoncé compterait plus de cases à cocher qu'on n'en peut lire. */
export const FAITS_MAXIMUM = 12;

export interface Contexte {
  algebre: Algebre;
  cheminComplet: boolean;
  entites: readonly string[];
}

/**
 * Les faits dont le retrait **à lui seul** rétablit la cohérence.
 *
 * C'est exactement l'intersection de tous les sous-ensembles insatisfiables
 * minimaux : un fait absent d'un seul d'entre eux laisse ce conflit intact. La
 * liste peut donc être vide — deux cycles contradictoires disjoints n'ont aucun
 * fait commun —, et c'est la raison pour laquelle les générateurs de
 * Contradiction imposent aux cycles de partager une arête. Le moteur rejette le
 * tirage plutôt que de poser une question sans réponse unique.
 */
export function faitsRedempteurs(contexte: Contexte, faits: readonly Fait[]): Fait[] {
  const { algebre, cheminComplet, entites } = contexte;
  if (coherent(algebre, cheminComplet, entites, faits)) return [];
  return faits.filter((_, i) => {
    const restants = faits.filter((__, j) => j !== i);
    return coherent(algebre, cheminComplet, entites, restants);
  });
}

/**
 * Un ensemble de faits force-t-il `relation` entre `a` et `b` ?
 *
 * La question est booléenne, et la réponse s'obtient presque toujours sans
 * énumérer les scénarios. La cohérence par chemin coûte un dixième de
 * milliseconde et rend un **sur-ensemble** des relations possibles ; on s'en
 * sert des deux côtés :
 *
 *  - si la relation visée n'y figure pas, elle est impossible : c'est « non » ;
 *  - si le sur-ensemble est déjà réduit à elle seule, la vraie liste y est
 *    incluse, et ne peut être que `{relation}` ou vide — donc il suffit
 *    d'exhiber **un** scénario pour conclure « oui ».
 *
 * Il ne reste à énumérer que le cas où le sur-ensemble hésite, et là deux
 * relations distinctes suffisent à répondre « non ».
 *
 * Ces trois raccourcis ne changent aucune réponse — la suite d'essais compare
 * le noyau à l'énumération exhaustive — mais ils décident du confort : la
 * version qui énumérait dans tous les cas demandait 832 ms pour un seul test
 * sur un réseau peu contraint, parce que prouver qu'une relation est *forcée*
 * oblige à visiter tous les scénarios, alors que la propagation le disait déjà.
 */
export function entraine(
  contexte: Contexte,
  faits: readonly Fait[],
  a: string,
  b: string,
  relation: string,
): boolean {
  const { algebre, cheminComplet, entites } = contexte;
  const parChemin = possibilitesParChemin(algebre, entites, faits, a, b);
  if (!parChemin.has(relation)) return false;
  if (parChemin.size === 1) return coherent(algebre, cheminComplet, entites, faits);
  const restantes = possibilites(algebre, cheminComplet, entites, faits, a, b, 2);
  return restantes.size === 1 && restantes.has(relation);
}

export interface Suffisant {
  /** Un sous-ensemble suffisant minimal — le plus petit lorsque `unique`. */
  faits: Fait[];
  /**
   * Vrai lorsque `faits` est le **seul** sous-ensemble suffisant minimal : tout
   * sous-ensemble suffisant le contient, et retirer n'importe lequel de ses
   * faits rend la conclusion indéterminée.
   */
  unique: boolean;
}

/** Un sous-ensemble suffisant minimal, obtenu par suppressions successives. */
function minimalParSuppression(
  contexte: Contexte,
  faits: readonly Fait[],
  a: string,
  b: string,
  relation: string,
): Fait[] {
  let restants = [...faits];
  for (let i = 0; i < faits.length; i += 1) {
    const essai = restants.filter((_, j) => restants[j] !== faits[i]);
    if (essai.length === restants.length) continue;
    if (entraine(contexte, essai, a, b, relation)) restants = essai;
  }
  return restants;
}

/**
 * Le plus petit sous-ensemble de prémisses entraînant la conclusion.
 *
 * Voir l'en-tête du fichier pour la caractérisation employée et sa preuve.
 * L'unicité n'est pas garantie en général : deux chaînes indépendantes peuvent
 * mener à la même conclusion, et il n'y a alors pas de « bonne » réponse à
 * cocher. Le drapeau est rendu au moteur, qui décide — Prémisses minimales
 * rejette le tirage, quand un moteur plus tolérant pourrait se contenter d'un
 * minimal quelconque.
 */
export function plusPetitSuffisant(
  contexte: Contexte,
  faits: readonly Fait[],
  a: string,
  b: string,
  relation: string,
): Suffisant | null {
  if (faits.length > FAITS_MAXIMUM) return null;
  if (!entraine(contexte, faits, a, b, relation)) return null;

  const necessaires = faits.filter(
    (_, i) => !entraine(contexte, faits.filter((__, j) => j !== i), a, b, relation),
  );
  if (entraine(contexte, necessaires, a, b, relation)) {
    return { faits: necessaires, unique: true };
  }
  return { faits: minimalParSuppression(contexte, faits, a, b, relation), unique: false };
}

/**
 * Parmi des faits candidats, ceux dont l'ajout rend la conclusion certaine.
 *
 * Le candidat doit rester **compatible** avec les prémisses : un fait qui rend
 * le réseau incohérent entraînerait formellement n'importe quoi, et serait une
 * réponse absurde. On l'écarte donc avant de tester l'entraînement.
 */
export function candidatsSuffisants(
  contexte: Contexte,
  premisses: readonly Fait[],
  candidats: readonly Fait[],
  a: string,
  b: string,
  relation: string,
): Fait[] {
  const { algebre, cheminComplet, entites } = contexte;
  return candidats.filter((candidat) => {
    const augmentees = [...premisses, candidat];
    if (!coherent(algebre, cheminComplet, entites, augmentees)) return false;
    return entraine(contexte, augmentees, a, b, relation);
  });
}
