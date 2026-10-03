/**
 * Classifieur d'algèbre abstraite — quatrième des huit noyaux.
 *
 * Il sert Hidden Algebra et Infer the Relation. Devant un ensemble d'arêtes, il
 * dit quelle algèbre le motif instancie : ordre, équivalence, opposition,
 * dominance cyclique, adjacence, succession, ascendance.
 *
 * Son intérêt n'est pas théorique mais de sûreté. Un système déclare l'algèbre
 * de chacune de ses relations, mais rien ne garantit que le **tirage** en
 * exhibe le motif : trois arêtes d'un ordre total tirées au hasard peuvent ne
 * montrer qu'une succession. Le moteur classe donc ce qui est réellement
 * montré, et rejette le tirage quand le motif ne tranche pas — plutôt que de
 * corriger sur la foi d'une étiquette que l'énoncé ne permettait pas de lire.
 */
import type { AlgebreAbstraite } from '../systemes/types';

export interface Proprietes {
  symetrique: boolean;
  antisymetrique: boolean;
  transitive: boolean;
  /** Toute paire distincte est reliée, dans un sens ou dans l'autre. */
  totale: boolean;
  /** Les arêtes forment un unique cycle couvrant toutes les entités. */
  cycleCouvrant: boolean;
  /** Les arêtes forment un unique chemin couvrant toutes les entités. */
  cheminCouvrant: boolean;
  /** Le graphe non orienté est biparti complet : deux camps, tout relié entre eux. */
  bipartiComplet: boolean;
  /** Chaque entité a au plus un prédécesseur, et le graphe est sans cycle. */
  arborescente: boolean;
  /**
   * Le graphe non orienté est un chemin couvrant : le motif de l'adjacence.
   * Distinct de `cheminCouvrant`, qui porte sur un graphe orienté — une
   * succession va dans un sens, une adjacence n'en a pas.
   */
  cheminNonOriente: boolean;
}

export type Arete = readonly [string, string];

export function proprietes(entites: readonly string[], aretes: readonly Arete[]): Proprietes {
  const presentes = new Set(aretes.map(([a, b]) => `${a}|${b}`));
  const a = (x: string, y: string) => presentes.has(`${x}|${y}`);

  let symetrique = true;
  let antisymetrique = true;
  let totale = true;
  for (const x of entites) {
    for (const y of entites) {
      if (x === y) continue;
      if (a(x, y) && !a(y, x)) symetrique = false;
      if (a(x, y) && a(y, x)) antisymetrique = false;
      if (!a(x, y) && !a(y, x)) totale = false;
    }
  }

  let transitive = true;
  for (const [x, y] of aretes) {
    for (const [y2, z] of aretes) {
      if (y !== y2 || x === z) continue;
      if (!a(x, z)) transitive = false;
    }
  }

  // Degrés sortants et entrants, pour reconnaître chemin, cycle et arborescence.
  const sortant = new Map(entites.map((e) => [e, 0]));
  const entrant = new Map(entites.map((e) => [e, 0]));
  for (const [x, y] of aretes) {
    sortant.set(x, (sortant.get(x) ?? 0) + 1);
    entrant.set(y, (entrant.get(y) ?? 0) + 1);
  }
  const degres = [...entites].map((e) => [sortant.get(e) ?? 0, entrant.get(e) ?? 0] as const);

  const n = entites.length;
  const cycleCouvrant =
    !symetrique &&
    aretes.length === n &&
    degres.every(([s, e]) => s === 1 && e === 1) &&
    connexe(entites, aretes);
  const cheminCouvrant =
    !symetrique &&
    aretes.length === n - 1 &&
    degres.filter(([s]) => s === 0).length === 1 &&
    degres.filter(([, e]) => e === 0).length === 1 &&
    degres.every(([s, e]) => s <= 1 && e <= 1) &&
    connexe(entites, aretes);

  const arborescente =
    antisymetrique && degres.every(([, e]) => e <= 1) && !comporteUnCycle(entites, aretes);

  return {
    symetrique,
    antisymetrique,
    transitive,
    totale,
    cycleCouvrant,
    cheminCouvrant,
    bipartiComplet: bipartiComplet(entites, aretes),
    arborescente,
    cheminNonOriente: cheminNonOriente(entites, aretes),
  };
}

/**
 * Le graphe non orienté est-il un chemin couvrant ? Deux extrémités de degré
 * un, tout le reste de degré deux, et connexe.
 */
function cheminNonOriente(entites: readonly string[], aretes: readonly Arete[]): boolean {
  if (entites.length < 2) return false;
  const voisins = new Map<string, Set<string>>(entites.map((e) => [e, new Set()]));
  for (const [x, y] of aretes) {
    if (x === y) continue;
    voisins.get(x)?.add(y);
    voisins.get(y)?.add(x);
  }
  const degres = entites.map((e) => voisins.get(e)!.size);
  const extremites = degres.filter((d) => d === 1).length;
  return (
    extremites === 2 &&
    degres.every((d) => d === 1 || d === 2) &&
    degres.reduce((somme, d) => somme + d, 0) === 2 * (entites.length - 1) &&
    connexe(entites, aretes)
  );
}

/** Le graphe non orienté sous-jacent est-il connexe ? */
function connexe(entites: readonly string[], aretes: readonly Arete[]): boolean {
  if (!entites.length) return true;
  const voisins = new Map<string, string[]>(entites.map((e) => [e, []]));
  for (const [x, y] of aretes) {
    voisins.get(x)?.push(y);
    voisins.get(y)?.push(x);
  }
  const vus = new Set<string>([entites[0]]);
  const pile = [entites[0]];
  while (pile.length) {
    for (const voisin of voisins.get(pile.pop()!) ?? []) {
      if (!vus.has(voisin)) {
        vus.add(voisin);
        pile.push(voisin);
      }
    }
  }
  return vus.size === entites.length;
}

function comporteUnCycle(entites: readonly string[], aretes: readonly Arete[]): boolean {
  const suivants = new Map<string, string[]>(entites.map((e) => [e, []]));
  for (const [x, y] of aretes) suivants.get(x)?.push(y);
  const etat = new Map<string, 0 | 1 | 2>(entites.map((e) => [e, 0]));

  function descendre(noeud: string): boolean {
    if (etat.get(noeud) === 1) return true;
    if (etat.get(noeud) === 2) return false;
    etat.set(noeud, 1);
    for (const suivant of suivants.get(noeud) ?? []) if (descendre(suivant)) return true;
    etat.set(noeud, 2);
    return false;
  }
  return entites.some((entite) => etat.get(entite) === 0 && descendre(entite));
}

/**
 * Deux camps, toutes les arêtes entre les camps et aucune à l'intérieur : le
 * motif de l'opposition. Le coloriage se fait par parcours ; tout conflit
 * infirme la bipartition.
 */
function bipartiComplet(entites: readonly string[], aretes: readonly Arete[]): boolean {
  if (aretes.length === 0) return false;
  const voisins = new Map<string, Set<string>>(entites.map((e) => [e, new Set()]));
  for (const [x, y] of aretes) {
    voisins.get(x)?.add(y);
    voisins.get(y)?.add(x);
  }

  const couleur = new Map<string, 0 | 1>();
  for (const depart of entites) {
    if (couleur.has(depart)) continue;
    couleur.set(depart, 0);
    const pile = [depart];
    while (pile.length) {
      const noeud = pile.pop()!;
      for (const voisin of voisins.get(noeud) ?? []) {
        const attendue = couleur.get(noeud) === 0 ? 1 : 0;
        const connue = couleur.get(voisin);
        if (connue === undefined) {
          couleur.set(voisin, attendue);
          pile.push(voisin);
        } else if (connue !== attendue) {
          return false;
        }
      }
    }
  }

  // Complet : toute paire de camps différents est reliée, et aucune paire du
  // même camp ne l'est.
  for (const x of entites) {
    for (const y of entites) {
      if (x === y) continue;
      const opposes = couleur.get(x) !== couleur.get(y);
      if (opposes !== voisins.get(x)!.has(y)) return false;
    }
  }
  return [...couleur.values()].some((c) => c === 0) && [...couleur.values()].some((c) => c === 1);
}

/**
 * Les prédicats définissant chaque algèbre, rendus **mutuellement exclusifs**.
 *
 * « ordre » exige de n'être pas arborescent et « ascendance » de l'être : sans
 * cette exclusion, une arborescence satisferait les deux, et l'exercice aurait
 * deux bonnes réponses.
 */
const PREDICATS: Record<AlgebreAbstraite, (p: Proprietes) => boolean> = {
  equivalence: (p) => p.symetrique && p.transitive,
  opposition: (p) => p.symetrique && !p.transitive && p.bipartiComplet,
  adjacence: (p) => p.symetrique && !p.transitive && p.cheminNonOriente,
  cyclique: (p) => p.antisymetrique && !p.transitive && p.cycleCouvrant,
  succession: (p) => p.antisymetrique && !p.transitive && p.cheminCouvrant,
  ascendance: (p) => p.antisymetrique && p.transitive && p.arborescente && !p.totale,
  ordre: (p) => p.antisymetrique && p.transitive && !p.arborescente,
};

/** Toutes les algèbres compatibles avec un motif. */
export function algebresCompatibles(
  entites: readonly string[],
  aretes: readonly Arete[],
): AlgebreAbstraite[] {
  if (!aretes.length) return [];
  const p = proprietes(entites, aretes);
  return (Object.keys(PREDICATS) as AlgebreAbstraite[]).filter((nom) => PREDICATS[nom](p));
}

/** Nombre minimal d'arêtes et d'entités pour qu'un motif soit lisible. */
const MOTIF_MINIMAL = { aretes: 3, entites: 3 };

/**
 * L'algèbre que le motif exhibe, ou `null` s'il n'en exhibe pas exactement une.
 *
 * Le refus est la règle et non l'exception : une arête isolée est compatible
 * avec presque toutes les algèbres, et trois entités reliées en chaîne ne
 * distinguent pas un ordre d'une succession. Un moteur qui reçoit `null`
 * retire, plutôt que de poser une question dont l'énoncé ne porte pas la
 * réponse.
 */
export function classer(
  entites: readonly string[],
  aretes: readonly Arete[],
): AlgebreAbstraite | null {
  if (aretes.length < MOTIF_MINIMAL.aretes || entites.length < MOTIF_MINIMAL.entites) return null;
  const compatibles = algebresCompatibles(entites, aretes);
  return compatibles.length === 1 ? compatibles[0] : null;
}

/** Les sept algèbres, avec leur intitulé d'option. */
export const INTITULES: Record<AlgebreAbstraite, string> = {
  ordre: 'un ordre — asymétrique et transitif',
  equivalence: 'une équivalence — symétrique et transitive',
  opposition: 'une opposition — symétrique, non transitive, en deux camps',
  cyclique: 'une dominance cyclique — chacun domine le suivant, le dernier le premier',
  adjacence: 'une adjacence — symétrique, de proche en proche',
  succession: 'une succession — orientée, sans transitivité',
  ascendance: 'une ascendance — transitive, chacun issu d\'un seul autre',
};
