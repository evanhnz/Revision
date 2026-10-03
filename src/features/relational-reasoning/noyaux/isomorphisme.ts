/**
 * Isomorphisme de structures relationnelles — deuxième des huit noyaux.
 *
 * Il sert Structure Match, Motif Search, Relational Web, Common Sub-System et
 * Partial Isomorphism. Il ne compose rien : il ne regarde que le motif des
 * arêtes, ce qui le rend utilisable jusque sur les systèmes du régime clos,
 * qui n'ont pas de table de composition.
 *
 * Sa fonction la plus importante ici n'est pas de trouver un isomorphisme mais
 * d'en **compter les automorphismes**. Un exercice qui demande d'apparier deux
 * réseaux n'a de réponse unique que si la structure est rigide : si elle admet
 * une symétrie non triviale, deux appariements différents sont tous deux
 * corrects, et corriger l'un comme faux serait une erreur. Les moteurs
 * concernés rejettent donc le tirage plutôt que de poser la question.
 */
import type { Instance, Modele, Systeme } from '../systemes/types';

/** La matrice des relations d'une instance, indexée comme ses entités. */
export type Matrice = string[][];

export function matrice(systeme: Systeme, instance: Instance): Matrice {
  const modele = instance.modele;
  return instance.entites.map((a) =>
    instance.entites.map((b) => {
      if (a === b) return '';
      if (modele) return systeme.relationDansModele(modele, a, b);
      return instance.faits.find((f) => f.sujet === a && f.objet === b)?.relation ?? '';
    }),
  );
}

/** Toutes les permutations d'indices, par ordre lexicographique. */
function* permutations(taille: number): Generator<number[]> {
  const indices = Array.from({ length: taille }, (_, i) => i);
  function* parcourir(prefixe: number[], reste: number[]): Generator<number[]> {
    if (!reste.length) {
      yield prefixe;
      return;
    }
    for (let i = 0; i < reste.length; i += 1) {
      yield* parcourir([...prefixe, reste[i]], [...reste.slice(0, i), ...reste.slice(i + 1)]);
    }
  }
  yield* parcourir([], indices);
}

/**
 * Le nombre d'automorphismes de la structure, identité comprise.
 *
 * Vaut 1 pour une structure rigide — c'est ce que les moteurs d'appariement
 * exigent. Le parcours est exhaustif : au plus 5 040 permutations pour sept
 * entités, ce qui reste immédiat et évite un algorithme dont la justesse
 * serait plus difficile à établir que le gain.
 */
export function nombreAutomorphismes(structure: Matrice): number {
  const n = structure.length;
  let total = 0;
  for (const pi of permutations(n)) {
    let conserve = true;
    for (let i = 0; i < n && conserve; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (structure[i][j] !== structure[pi[i]][pi[j]]) {
          conserve = false;
          break;
        }
      }
    }
    if (conserve) total += 1;
  }
  return total;
}

/** La structure est-elle rigide, donc appariable de façon unique ? */
export function rigide(systeme: Systeme, instance: Instance): boolean {
  return nombreAutomorphismes(matrice(systeme, instance)) === 1;
}

/**
 * Cherche un isomorphisme entre deux structures, ou rend `null`.
 * Rendu sous forme de tableau : `resultat[i]` est l'indice de l'image de i.
 */
export function isomorphisme(gauche: Matrice, droite: Matrice): number[] | null {
  if (gauche.length !== droite.length) return null;
  const n = gauche.length;
  for (const pi of permutations(n)) {
    let conserve = true;
    for (let i = 0; i < n && conserve; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (gauche[i][j] !== droite[pi[i]][pi[j]]) {
          conserve = false;
          break;
        }
      }
    }
    if (conserve) return pi;
  }
  return null;
}

/** Les deux structures sont-elles isomorphes ? */
export function isomorphes(gauche: Matrice, droite: Matrice): boolean {
  return isomorphisme(gauche, droite) !== null;
}

/**
 * Réétiquette une instance : mêmes relations, noms et positions nouveaux.
 *
 * Les positions sont brouillées autant que les noms. Sans cela, un appariement
 * se lirait sur la disposition du dessin au lieu de la structure — ce que le
 * cahier des charges demande précisément d'empêcher pour Relational Web.
 *
 * **Toutes les formes de modèle doivent être réétiquetées, sans exception.** Le
 * modèle est indexé par nom d'entité ; en oublier une forme laisse la copie
 * pointer vers les anciens noms, et `matrice` lit alors une structure vide. Le
 * symptôme est trompeur — « l'appariement ne transporte pas la structure » —
 * parce que la faute n'est pas dans l'appariement mais dans la copie. C'est
 * arrivé à l'ajout de `digraph` et de `poset`, dont les modèles portent des
 * arêtes et une clôture transitive là où les systèmes-produits ne portaient que
 * des coordonnées. D'où la règle : **un nouveau champ de `Modele` se
 * réétiquette ici, dans la même modification qui l'introduit.**
 */
export function reetiqueter(
  instance: Instance,
  nouveauxNoms: readonly string[],
  ordreAffichage: readonly number[],
): { instance: Instance; correspondance: Record<string, string> } {
  const correspondance: Record<string, string> = {};
  instance.entites.forEach((ancien, i) => {
    correspondance[ancien] = nouveauxNoms[i];
  });

  const coordonnees = instance.modele?.coordonnees;
  const camps = instance.modele?.camps;
  const modele: Modele = {};
  if (coordonnees) {
    modele.coordonnees = {};
    for (const [ancien, coord] of Object.entries(coordonnees)) {
      modele.coordonnees[correspondance[ancien]] = coord;
    }
  }
  if (camps) {
    modele.camps = {};
    for (const [ancien, camp] of Object.entries(camps)) {
      modele.camps[correspondance[ancien]] = camp;
    }
  }
  const aretes = instance.modele?.aretes;
  if (aretes) {
    modele.aretes = aretes.map((fait) => ({
      sujet: correspondance[fait.sujet],
      relation: fait.relation,
      objet: correspondance[fait.objet],
    }));
  }
  const apres = instance.modele?.apres;
  if (apres) {
    modele.apres = {};
    for (const [ancien, suivants] of Object.entries(apres)) {
      modele.apres[correspondance[ancien]] = suivants.map((nom) => correspondance[nom]);
    }
  }
  const segments = instance.modele?.segments;
  if (segments) {
    modele.segments = {};
    for (const [ancien, segment] of Object.entries(segments)) {
      modele.segments[correspondance[ancien]] = segment;
    }
  }

  // Garde-fou : un champ de modèle non traité ci-dessus produirait une copie
  // pointant vers les anciens noms, et l'échec se manifesterait loin de sa cause
  // — « l'appariement ne transporte pas la structure », alors que c'est la copie
  // qui est fausse. L'omission s'est produite deux fois : à l'ajout de `digraph`
  // et `poset`, puis à celui d'`allen` et `rcc8`. Plutôt qu'un troisième
  // commentaire d'avertissement, une vérification qui **échoue bruyamment**.
  if (instance.modele) {
    const traites = new Set(['coordonnees', 'camps', 'aretes', 'apres', 'segments']);
    const oublies = Object.keys(instance.modele).filter((cle) => !traites.has(cle));
    if (oublies.length) {
      throw new Error(
        `reetiqueter : champ(s) de modèle non réétiqueté(s) : ${oublies.join(', ')}. ` +
          'Ajoutez-les dans cette fonction, sinon la copie garde les anciens noms.',
      );
    }
  }

  return {
    instance: {
      systeme: instance.systeme,
      entites: ordreAffichage.map((i) => correspondance[instance.entites[i]]),
      faits: instance.faits.map((fait) => ({
        sujet: correspondance[fait.sujet],
        relation: fait.relation,
        objet: correspondance[fait.objet],
      })),
      modele: Object.keys(modele).length ? modele : undefined,
    },
    correspondance,
  };
}

/**
 * Les occurrences d'un motif dans un hôte : les injections du premier dans le
 * second qui conservent les arêtes.
 *
 * `induit` commande la lecture de l'**absence** d'arête. Vrai — le défaut —, le
 * motif doit apparaître exactement : deux sommets non reliés dans le motif ne
 * peuvent pas l'être dans l'hôte. Faux, seules les arêtes énoncées doivent se
 * retrouver, l'hôte pouvant en avoir davantage.
 *
 * La distinction n'est pas décorative, elle décide de la justesse de l'exercice.
 * « Ce motif apparaît-il ? » n'a de réponse déterminée qu'en lecture induite :
 * sans elle, un motif à deux arêtes se retrouve dans presque tout réseau dense,
 * et les leurres cesseraient d'être faux. C'est aussi la lecture qui convient au
 * régime clos, où l'absence d'arête est une négation et non une inconnue.
 *
 * Le parcours est un retour sur trace avec élagage : une image n'est étendue que
 * si elle respecte déjà les arêtes entre les sommets placés. Pour des motifs de
 * trois à quatre sommets dans des hôtes de sept, il n'explore que quelques
 * centaines d'états.
 */
export function occurrences(motif: Matrice, hote: Matrice, induit = true): number[][] {
  const k = motif.length;
  const n = hote.length;
  if (k > n) return [];

  const trouvees: number[][] = [];
  const image: number[] = [];
  const pris = new Array<boolean>(n).fill(false);

  /** L'ajout de `candidat` en position `place` respecte-t-il le motif ? */
  const compatible = (place: number, candidat: number): boolean => {
    for (let i = 0; i < place; i += 1) {
      const attenduAller = motif[i][place];
      const attenduRetour = motif[place][i];
      const reelAller = hote[image[i]][candidat];
      const reelRetour = hote[candidat][image[i]];
      if (attenduAller) {
        if (reelAller !== attenduAller) return false;
      } else if (induit && reelAller) return false;
      if (attenduRetour) {
        if (reelRetour !== attenduRetour) return false;
      } else if (induit && reelRetour) return false;
    }
    return true;
  };

  const parcourir = (place: number): void => {
    if (place === k) {
      trouvees.push([...image]);
      return;
    }
    for (let candidat = 0; candidat < n; candidat += 1) {
      if (pris[candidat] || !compatible(place, candidat)) continue;
      pris[candidat] = true;
      image[place] = candidat;
      parcourir(place + 1);
      pris[candidat] = false;
    }
  };

  parcourir(0);
  return trouvees;
}

/** Le motif apparaît-il dans l'hôte ? */
export function apparait(motif: Matrice, hote: Matrice, induit = true): boolean {
  return occurrences(motif, hote, induit).length > 0;
}

/** Extrait la sous-matrice induite par une liste d'indices. */
export function sousMatrice(structure: Matrice, indices: readonly number[]): Matrice {
  return indices.map((i) => indices.map((j) => structure[i][j]));
}
