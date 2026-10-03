/**
 * Système `cyclic` : une dominance cyclique, à trois forces.
 *
 * Chaque entité reçoit l'une de trois **forces** disposées en cycle : la première
 * domine la deuxième, la deuxième la troisième, la troisième la première. C'est
 * la structure de pierre-feuille-ciseaux, et c'est le groupe **Z₃** : le décalage
 * de force se compose par addition modulo trois.
 *
 * **La non-transitivité est l'exercice.** « A domine B, B domine C, donc A domine
 * C » est le raisonnement que ce système punit, et le seul endroit du catalogue
 * où il est faux de façon aussi nette. La vérité est ici l'inverse : sur trois
 * forces, A domine B et B domine C entraînent que **C domine A**. L'intuition
 * d'ordre est si forte que l'erreur survit à plusieurs corrections ; c'est
 * précisément ce qui en fait un bon exercice.
 *
 * Deux conséquences de structure, qu'il faut assumer plutôt que masquer.
 *
 * **La composition est fonctionnelle**, comme celle de `groups` : elle rend
 * toujours une relation unique. Le système est donc parfait pour l'induction et
 * l'isomorphisme, et inutilisable pour les moteurs d'indétermination — qui n'y
 * trouveraient jamais de paire ouverte. Le catalogue le déclare par
 * `compatible`, sans qu'aucun moteur ait à connaître ce système.
 *
 * **Le vocabulaire compte trois relations et non deux** : « est de même force
 * que » est indispensable. Sans elle, la composition de « domine » et de « est
 * dominé par » n'aurait pas de valeur à rendre — deux entités de même force ne
 * sont ni l'une ni l'autre.
 */
import type { Alea, Instance, Modele, Systeme } from './types';

const DOMINE = 'domine';
const DOMINE_PAR = 'domine-par';
const EGALE = 'egale';

const NOMS = ['Aster', 'Brasier', 'Cyclone', 'Dune', 'Éclat', 'Flux', 'Givre'];

/**
 * Le décalage de force qu'une relation exprime, modulo trois. « domine » vaut
 * − 1 : le dominant précède le dominé dans le cycle.
 */
const DECALAGE: Record<string, number> = { [DOMINE]: 2, [DOMINE_PAR]: 1, [EGALE]: 0 };
const PAR_DECALAGE: Record<number, string> = { 0: EGALE, 1: DOMINE_PAR, 2: DOMINE };

/** Le représentant de `n` modulo trois, toujours dans {0, 1, 2}. */
function modulo3(n: number): number {
  return ((n % 3) + 3) % 3;
}

function relationDansModele(modele: Modele, a: string, b: string): string {
  const forces = modele.camps ?? {};
  // Convention : le décalage d'une relation est force(sujet) − force(objet),
  // modulo trois. « a domine b » signifie que la force de b suit immédiatement
  // celle de a dans le cycle, soit force(a) − force(b) ≡ − 1 ≡ 2.
  return PAR_DECALAGE[modulo3((forces[a] ?? 0) - (forces[b] ?? 0))];
}

export const cyclic: Systeme = {
  id: 'cyclic',
  nom: 'Dominance cyclique',
  resume:
    'Trois forces en cycle : la première domine la deuxième, la deuxième la troisième, ' +
    'la troisième la première.',
  regimes: ['algebre'],
  relations: [
    { id: DOMINE, libelle: 'domine', bref: 'domine', algebre: 'cyclique' },
    { id: DOMINE_PAR, libelle: 'est dominé par', bref: 'dominé' },
    { id: EGALE, libelle: 'est de même force que', bref: 'égale', algebre: 'equivalence' },
  ],
  monde: 'ouvert',
  converse: (relation) =>
    relation === DOMINE ? DOMINE_PAR : relation === DOMINE_PAR ? DOMINE : EGALE,
  // Addition des décalages modulo trois : le groupe Z₃, donc une composition
  // fonctionnelle.
  // Les décalages s'additionnent : force(a) − force(c) est la somme de
  // force(a) − force(b) et de force(b) − force(c). D'où « domine ∘ domine =
  // est dominé par » : 2 + 2 ≡ 1.
  composer: (r, s) => new Set([PAR_DECALAGE[modulo3((DECALAGE[r] ?? 0) + (DECALAGE[s] ?? 0))]]),
  cheminComplet: true,
  relationDansModele,

  engendrer(difficulte: number, alea: Alea): Instance {
    const nombre = Math.min(NOMS.length, 3 + Math.floor(difficulte / 2));
    const entites = alea.plusieurs(NOMS, nombre);

    // Les trois forces doivent toutes apparaître : sinon le cycle ne se voit
    // pas et le système se lit comme un ordre ou une équivalence.
    const forces: Record<string, number> = {};
    const melange = alea.melanger(entites);
    melange.forEach((entite, i) => {
      forces[entite] = i < 3 ? i : alea.entier(3);
    });
    const modele: Modele = { camps: forces };

    // Une chaîne couvrante, comme pour `groups` : la composition étant
    // fonctionnelle, elle détermine tout le réseau, et un tirage arête par
    // arête produirait presque toujours un triangle impossible.
    const ordre = alea.melanger(entites);
    const faits = ordre.slice(1).map((entite, i) => ({
      sujet: entite,
      relation: relationDansModele(modele, entite, ordre[i]),
      objet: ordre[i],
    }));

    return { systeme: 'cyclic', entites, faits: alea.melanger(faits), modele };
  },

  rendu: 'graphe',
};
