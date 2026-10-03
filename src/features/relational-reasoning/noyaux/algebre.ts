/**
 * Le solveur de cohérence de chemin — premier des huit noyaux.
 *
 * Il sert toute la catégorie « Incompleteness », les moteurs RCC8 et Allen, et
 * le calcul de la réponse de la plupart des moteurs d'analogie. Il ne connaît
 * aucun système : seulement un vocabulaire de relations, une table de
 * composition et une involution de converse.
 *
 * **Les ensembles de relations sont des masques de bits.** Un vocabulaire ne
 * dépasse jamais trente-et-une relations — vingt-sept pour le plus large,
 * `space` —, si bien qu'un ensemble tient dans un entier et que l'intersection
 * se fait par un « et » logique. La composition d'ensembles est de surcroît
 * mémoïsée : c'est le point chaud de tout le solveur, la propagation composant
 * sans cesse les mêmes paires de masques, puisque les arêtes sont le plus
 * souvent soit des singletons, soit l'ignorance complète. L'API publique reste
 * en `Set`, la conversion se faisant aux frontières.
 *
 * Deux façons d'obtenir « quelles relations sont encore possibles » :
 *
 *  - `cohererParChemin`, qui restreint chaque paire par la composition de ses
 *    chemins. Exacte pour l'algèbre de points et ses produits — donc pour
 *    `line`, `plane` et `space` — ainsi que pour les algèbres fonctionnelles
 *    comme `groups`.
 *  - `possibilitesExactes`, qui énumère les scénarios cohérents. Nécessaire
 *    pour RCC8 et Allen, où la cohérence par chemin ne donne qu'un
 *    sur-ensemble : un réseau peut y être cohérent par chemin sans admettre
 *    aucun scénario. Les systèmes le déclarent par `cheminComplet`.
 */
import type { Fait } from '../systemes/types';

/** Ce que le solveur demande d'un système, et rien de plus. */
export interface Algebre {
  relations: readonly string[];
  converse(relation: string): string;
  composer(r: string, s: string): ReadonlySet<string>;
}

/**
 * Algèbre compilée : tables en entiers, indexées par rang de relation.
 * `composition[r * taille + s]` est le masque des relations possibles.
 */
export interface AlgebreCompilee {
  noms: readonly string[];
  rangs: ReadonlyMap<string, number>;
  taille: number;
  composition: Int32Array;
  converseRang: Int32Array;
  /** Converse d'un masque entier, précalculé pour les masques d'un seul bit. */
  converseMasque: Int32Array;
  /** Masque de toutes les relations : l'ignorance complète. */
  universel: number;
  /**
   * Mémo de la composition d'**ensembles**. Une table dense serait préférable
   * mais impraticable : pour les treize relations d'Allen elle compterait
   * soixante-sept millions d'entrées.
   */
  memo: Map<number, number>;
}

const cache = new WeakMap<Algebre, AlgebreCompilee>();

export function compiler(algebre: Algebre): AlgebreCompilee {
  const dejaFait = cache.get(algebre);
  if (dejaFait) return dejaFait;

  const noms = [...algebre.relations];
  const taille = noms.length;
  if (taille > 31) {
    throw new Error(
      `Vocabulaire de ${taille} relations : le solveur en masques de bits en admet 31 au plus.`,
    );
  }
  const rangs = new Map(noms.map((nom, rang) => [nom, rang]));

  const composition = new Int32Array(taille * taille);
  for (let r = 0; r < taille; r += 1) {
    for (let s = 0; s < taille; s += 1) {
      let masque = 0;
      for (const t of algebre.composer(noms[r], noms[s])) {
        const rang = rangs.get(t);
        if (rang !== undefined) masque |= 1 << rang;
      }
      composition[r * taille + s] = masque;
    }
  }

  const converseRang = new Int32Array(taille);
  const converseMasque = new Int32Array(taille);
  for (let r = 0; r < taille; r += 1) {
    converseRang[r] = rangs.get(algebre.converse(noms[r])) ?? r;
    converseMasque[r] = 1 << converseRang[r];
  }

  const compilee: AlgebreCompilee = {
    noms,
    rangs,
    taille,
    composition,
    converseRang,
    converseMasque,
    universel: taille === 31 ? 0x7fffffff : (1 << taille) - 1,
    memo: new Map(),
  };
  cache.set(algebre, compilee);
  return compilee;
}

/** Le converse d'un masque : chaque bit retourné. */
export function converseDeMasque(a: AlgebreCompilee, masque: number): number {
  let resultat = 0;
  let reste = masque;
  while (reste) {
    const bit = reste & -reste;
    resultat |= a.converseMasque[31 - Math.clz32(bit)];
    reste ^= bit;
  }
  return resultat;
}

/** Composition de deux masques : l'union des compositions terme à terme. */
export function composerMasques(a: AlgebreCompilee, gauche: number, droite: number): number {
  if (!gauche || !droite) return 0;
  const clef = gauche * (1 << a.taille) + droite;
  const connu = a.memo.get(clef);
  if (connu !== undefined) return connu;

  let resultat = 0;
  let restantG = gauche;
  while (restantG) {
    const bitG = restantG & -restantG;
    restantG ^= bitG;
    const base = (31 - Math.clz32(bitG)) * a.taille;
    let restantD = droite;
    while (restantD) {
      const bitD = restantD & -restantD;
      restantD ^= bitD;
      resultat |= a.composition[base + (31 - Math.clz32(bitD))];
    }
  }
  a.memo.set(clef, resultat);
  return resultat;
}

/** Combien de relations un masque désigne-t-il ? */
function nombreDeBits(masque: number): number {
  let reste = masque;
  let compte = 0;
  while (reste) {
    reste &= reste - 1;
    compte += 1;
  }
  return compte;
}

export function masqueVers(a: AlgebreCompilee, masque: number): Set<string> {
  const resultat = new Set<string>();
  for (let r = 0; r < a.taille; r += 1) if (masque & (1 << r)) resultat.add(a.noms[r]);
  return resultat;
}

export function versMasque(a: AlgebreCompilee, relations: Iterable<string>): number {
  let masque = 0;
  for (const relation of relations) {
    const rang = a.rangs.get(relation);
    if (rang !== undefined) masque |= 1 << rang;
  }
  return masque;
}

/** Compose deux ensembles de relations, relation à relation. */
export function composerEnsembles(
  algebre: Algebre,
  gauche: Iterable<string>,
  droite: Iterable<string>,
): Set<string> {
  const a = compiler(algebre);
  return masqueVers(a, composerMasques(a, versMasque(a, gauche), versMasque(a, droite)));
}

/**
 * Compose une chaîne de relations : la réponse exacte quand les faits forment
 * un chemin simple, ce qui est le cas de la plupart des énoncés engendrés.
 */
export function composerChemin(algebre: Algebre, chaine: readonly string[]): Set<string> {
  const a = compiler(algebre);
  if (!chaine.length) return new Set();
  let courant = versMasque(a, [chaine[0]]);
  for (let i = 1; i < chaine.length; i += 1) {
    courant = composerMasques(a, courant, versMasque(a, [chaine[i]]));
  }
  return masqueVers(a, courant);
}

/**
 * Le réseau de contraintes, à plat : `reseau[i * n + j]` est le masque des
 * relations encore possibles de l'entité i vers l'entité j. Un masque nul
 * signale l'incohérence ; la diagonale reste nulle et n'est jamais lue.
 */
export type Reseau = Int32Array;

/**
 * Construit le réseau initial : les faits énoncés donnent un singleton, les
 * paires muettes tout le vocabulaire. Rend `null` si deux faits se contredisent
 * d'emblée.
 */
export function reseauInitial(
  algebre: Algebre,
  entites: readonly string[],
  faits: readonly Fait[],
): Reseau | null {
  const a = compiler(algebre);
  const n = entites.length;
  const index = new Map(entites.map((e, i) => [e, i]));
  const reseau = new Int32Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i !== j) reseau[i * n + j] = a.universel;
    }
  }

  for (const fait of faits) {
    const i = index.get(fait.sujet);
    const j = index.get(fait.objet);
    const rang = a.rangs.get(fait.relation);
    if (i === undefined || j === undefined || i === j || rang === undefined) continue;
    const masque = 1 << rang;
    if (!(reseau[i * n + j] & masque)) return null;
    reseau[i * n + j] = masque;
    reseau[j * n + i] = a.converseMasque[rang];
  }
  return reseau;
}

/**
 * Restreint le réseau par cohérence de chemin. Rend faux dès qu'une paire se
 * vide — le réseau est alors incohérent, ce dont vit le moteur Contradiction.
 *
 * Une passe complète d'abord, puis une propagation par file : seules les arêtes
 * voisines d'une arête modifiée sont réexaminées. L'énumération de scénarios
 * appelle cette fonction des milliers de fois, d'où le soin porté à ne rien
 * recalculer sans raison.
 */
export function cohererParChemin(algebre: Algebre, reseau: Reseau, taille?: number): boolean {
  const a = compiler(algebre);
  const n = taille ?? Math.round(Math.sqrt(reseau.length));
  if (n < 3) return reseau.every((masque, position) => position % (n + 1) === 0 || masque !== 0);

  const file: number[] = [];
  const enFile = new Uint8Array(n * n);

  /** Restreint x → y par le passage en z. Rend faux si la paire se vide. */
  function reviser(x: number, y: number, z: number): boolean {
    const avant = reseau[x * n + y];
    const apres = avant & composerMasques(a, reseau[x * n + z], reseau[z * n + y]);
    if (apres === avant) return true;
    if (!apres) return false;
    reseau[x * n + y] = apres;
    reseau[y * n + x] = converseDeMasque(a, apres);
    for (const arete of [x * n + y, y * n + x]) {
      if (!enFile[arete]) {
        enFile[arete] = 1;
        file.push(arete);
      }
    }
    return true;
  }

  // Passe initiale : tous les triples.
  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      if (i === k) continue;
      for (let j = 0; j < n; j += 1) {
        if (j === k || j === i) continue;
        if (!reviser(i, j, k)) return false;
      }
    }
  }

  // Propagation : une arête modifiée ne peut contraindre que ses voisines.
  while (file.length) {
    const arete = file.pop()!;
    enFile[arete] = 0;
    const i = (arete / n) | 0;
    const j = arete % n;
    for (let k = 0; k < n; k += 1) {
      if (k === i || k === j) continue;
      if (!reviser(i, k, j)) return false;
      if (!reviser(k, j, i)) return false;
    }
  }
  return true;
}

/**
 * Les relations possibles entre deux entités, par cohérence de chemin seule.
 * Exacte pour les systèmes qui déclarent `cheminComplet`.
 */
export function possibilitesParChemin(
  algebre: Algebre,
  entites: readonly string[],
  faits: readonly Fait[],
  a: string,
  b: string,
): Set<string> {
  const compilee = compiler(algebre);
  const n = entites.length;
  const reseau = reseauInitial(algebre, entites, faits);
  if (!reseau || !cohererParChemin(algebre, reseau, n)) return new Set();
  const i = entites.indexOf(a);
  const j = entites.indexOf(b);
  if (i < 0 || j < 0) return new Set();
  return masqueVers(compilee, reseau[i * n + j]);
}

/** Bornes de l'énumération, pour qu'un cas pathologique ne gèle pas la page. */
const BUDGET_NOEUDS = 400_000;

/**
 * Les relations possibles entre deux entités, par énumération des scénarios
 * cohérents. Exacte pour toute algèbre, au prix d'un parcours.
 *
 * Un scénario affecte une relation de base à chaque paire. On n'énumère que les
 * paires restées ouvertes après propagation, en propageant à nouveau après
 * chaque choix. La paire interrogée passe en dernier : les autres choix l'auront
 * le plus souvent déjà réduite.
 *
 * Rend `null` si le budget est épuisé — l'appelant se rabat alors sur la
 * cohérence par chemin plutôt que de rendre une réponse fausse.
 *
 * `arretDesQue` arrête le parcours dès que ce nombre de relations distinctes a
 * été vu. Presque tous les appels du site ne veulent pas l'ensemble mais un
 * booléen : « reste-t-il au moins un scénario ? » (1), « en reste-t-il plus
 * d'un ? » (2). Les calculer en énumérant *tout* coûtait cher exactement là où
 * la réponse était la plus facile : un réseau peu contraint admet une foule de
 * scénarios, et la réponse tombe au deuxième. Le résultat est alors **tronqué**
 * — il compte au moins `arretDesQue` relations, sans prétendre à l'exhaustivité.
 * Il ne doit donc servir qu'à une comparaison au seuil demandé.
 */
export function possibilitesExactes(
  algebre: Algebre,
  entites: readonly string[],
  faits: readonly Fait[],
  a: string,
  b: string,
  arretDesQue = Number.POSITIVE_INFINITY,
): Set<string> | null {
  const compilee = compiler(algebre);
  const n = entites.length;
  const depart = reseauInitial(algebre, entites, faits);
  if (!depart || !cohererParChemin(algebre, depart, n)) return new Set();

  const ia = entites.indexOf(a);
  const ib = entites.indexOf(b);
  if (ia < 0 || ib < 0) return new Set();
  const interrogee = Math.min(ia, ib) * n + Math.max(ia, ib);

  const paires: number[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const arete = i * n + j;
      // Une arête déjà réduite à un seul bit ne demande pas de branchement.
      if (arete !== interrogee && depart[arete] !== (depart[arete] & -depart[arete])) {
        paires.push(arete);
      }
    }
  }
  paires.push(interrogee);

  let trouvees = 0;
  let noeuds = 0;
  let deborde = false;
  let assez = false;

  function explorer(reseau: Reseau, rang: number): void {
    if (deborde || assez) return;
    if (rang === paires.length) {
      trouvees |= reseau[ia * n + ib];
      if (nombreDeBits(trouvees) >= arretDesQue) assez = true;
      return;
    }
    const arete = paires[rang];
    const i = (arete / n) | 0;
    const j = arete % n;
    let reste = reseau[arete];
    while (reste) {
      const bit = reste & -reste;
      reste ^= bit;
      noeuds += 1;
      if (noeuds > BUDGET_NOEUDS) {
        deborde = true;
        return;
      }
      const essai = Int32Array.from(reseau);
      essai[arete] = bit;
      essai[j * n + i] = compilee.converseMasque[31 - Math.clz32(bit)];
      if (cohererParChemin(algebre, essai, n)) explorer(essai, rang + 1);
      if (deborde || assez) return;
    }
  }

  explorer(depart, 0);
  return deborde ? null : masqueVers(compilee, trouvees);
}

/**
 * Les relations possibles, par la voie que le système déclare suffisante.
 * C'est l'entrée qu'utilisent les moteurs ; ils n'ont pas à savoir laquelle.
 */
export function possibilites(
  algebre: Algebre,
  cheminComplet: boolean,
  entites: readonly string[],
  faits: readonly Fait[],
  a: string,
  b: string,
  arretDesQue = Number.POSITIVE_INFINITY,
): Set<string> {
  if (cheminComplet) return possibilitesParChemin(algebre, entites, faits, a, b);
  const exactes = possibilitesExactes(algebre, entites, faits, a, b, arretDesQue);
  return exactes ?? possibilitesParChemin(algebre, entites, faits, a, b);
}

/** Le réseau des faits admet-il au moins un scénario ? */
export function coherent(
  algebre: Algebre,
  cheminComplet: boolean,
  entites: readonly string[],
  faits: readonly Fait[],
): boolean {
  const reseau = reseauInitial(algebre, entites, faits);
  if (!reseau || !cohererParChemin(algebre, reseau, entites.length)) return false;
  if (cheminComplet || entites.length < 2) return true;
  // Algèbre où la cohérence par chemin ne suffit pas : il faut exhiber un
  // scénario — un seul, d'où l'arrêt au premier trouvé.
  const resultat = possibilitesExactes(algebre, entites, faits, entites[0], entites[1], 1);
  return resultat === null || resultat.size > 0;
}
