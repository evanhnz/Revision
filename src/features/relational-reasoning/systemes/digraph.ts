/**
 * Système `digraph` : un réseau d'unités qui se transmettent des dossiers.
 *
 * C'est le seul système **sans table de composition**, et c'est voulu. « transmet
 * à » n'est ni transitive ni composable : si A transmet à B et B à C, rien ne
 * s'ensuit pour A et C. Seules les arêtes énoncées valent, et l'absence d'arête
 * est une **négation**, non une inconnue — d'où `monde: 'clos'`.
 *
 * Cette pauvreté est exactement ce qui le rend utile. Les moteurs de la
 * catégorie « information incomplète » vivent de l'indétermination et ne peuvent
 * donc pas tourner ici : le régime les en écarte, sans qu'aucun moteur ait à
 * connaître ce système. À l'inverse, les moteurs d'isomorphisme de sous-graphe
 * ne regardent que le motif des arêtes, et trouvent ici leur terrain le plus
 * propre : rien ne se déduit, tout se lit.
 *
 * Deux relations, et non une seule. « transmet à » est orientée, « coopère avec »
 * est symétrique : un motif peut alors se distinguer d'un autre par
 * l'**étiquette** de ses arêtes autant que par leur disposition, ce qui donne des
 * leurres non triviaux à Motif Search. Un système à relation unique aurait réduit
 * l'exercice à compter des flèches.
 */
import type { Alea, Fait, Instance, Modele, Systeme } from './types';

const TRANSMET = 'transmet';
const RECOIT = 'recoit';
const COOPERE = 'coopere';

const NOMS = ['Bureau A', 'Bureau B', 'Cellule C', 'Pôle D', 'Pôle E', 'Service F', 'Unité G'];

/**
 * Le modèle d'une instance de `digraph` est la liste de ses arêtes elle-même :
 * il n'y a pas de structure sous-jacente dont les faits seraient une lecture
 * partielle. `relationDansModele` lit donc les faits, et rend la chaîne vide
 * quand aucun fait ne relie la paire — ce qui, en monde clos, **est**
 * l'information.
 */
function lecture(faits: readonly Fait[], a: string, b: string): string {
  const direct = faits.find((f) => f.sujet === a && f.objet === b);
  if (direct) return direct.relation;
  const inverse = faits.find((f) => f.sujet === b && f.objet === a);
  if (!inverse) return '';
  // Lue dans l'autre sens, une transmission devient une réception ; une
  // coopération reste une coopération.
  return inverse.relation === TRANSMET ? RECOIT : COOPERE;
}

export const digraph: Systeme = {
  id: 'digraph',
  nom: 'Réseau de services',
  resume: 'Des unités qui se transmettent des dossiers ou coopèrent, sans règle de transitivité.',
  regimes: ['clos'],
  relations: [
    // Aucune `algebre` déclarée, ni pour l'une ni pour l'autre : c'est le propre
    // de ce système qu'aucune structure abstraite ne les gouverne. Leur en
    // prêter une ferait promettre à Algèbre cachée une régularité que les
    // instances — un arbre plus quelques arcs transversaux — ne présentent pas,
    // et le classifieur ne trouverait alors aucune algèbre compatible avec ce
    // qu'il affiche. Le moteur écarte donc `digraph` de lui-même, faute de
    // relation candidate, ce qui est le bon comportement.
    { id: TRANSMET, libelle: 'transmet à', bref: 'transmet' },
    { id: RECOIT, libelle: 'reçoit de', bref: 'reçoit' },
    { id: COOPERE, libelle: 'coopère avec', bref: 'coopère' },
  ],
  monde: 'clos',
  /**
   * « transmet à » n'est **pas** sa propre converse : si A transmet à B, B ne
   * transmet pas à A, il reçoit de A. D'où une troisième relation dans le
   * vocabulaire, qui ne sert jamais à énoncer un fait — les instances
   * n'émettent que des transmissions et des coopérations — mais qui est
   * indispensable pour **lire** une paire dans l'autre sens.
   *
   * Le déclarer symétrique était une erreur de modélisation, et elle s'est
   * manifestée loin de sa cause : le dessin d'un motif ne traçant qu'un sens
   * des relations symétriques, deux motifs pourtant distincts se dessinaient
   * à l'identique, et Recherche de motif proposait deux options indiscernables.
   */
  converse: (relation) =>
    relation === TRANSMET ? RECOIT : relation === RECOIT ? TRANSMET : COOPERE,
  // Aucune table de composition : c'est la définition du régime clos.
  cheminComplet: true,

  relationDansModele(modele: Modele, a: string, b: string): string {
    return lecture(modele.aretes ?? [], a, b);
  },

  engendrer(difficulte: number, alea: Alea): Instance {
    const nombre = Math.min(NOMS.length, 4 + Math.floor(difficulte / 2));
    const entites = alea.plusieurs(NOMS, nombre);

    // Une arborescence de transmission d'abord : elle garantit la connexité,
    // sans quoi un motif pourrait n'avoir aucune chance d'apparaître.
    const faits: Fait[] = [];
    for (let i = 1; i < entites.length; i += 1) {
      const parent = entites[alea.entier(i)];
      faits.push({ sujet: parent, relation: TRANSMET, objet: entites[i] });
    }

    // Puis quelques coopérations, et quelques transmissions transversales. Le
    // nombre croît avec la difficulté : un réseau dense rend les motifs plus
    // nombreux, donc plus difficiles à départager.
    const paires: [string, string][] = [];
    for (let i = 0; i < entites.length; i += 1) {
      for (let j = i + 1; j < entites.length; j += 1) paires.push([entites[i], entites[j]]);
    }
    const libres = alea
      .melanger(paires)
      .filter(([a, b]) => !faits.some((f) => (f.sujet === a && f.objet === b) || (f.sujet === b && f.objet === a)));

    const supplement = Math.min(libres.length, 1 + Math.floor(difficulte / 3));
    for (let i = 0; i < supplement; i += 1) {
      const [a, b] = libres[i];
      const cooperation = alea.reel() < 0.5;
      faits.push(
        cooperation
          ? { sujet: a, relation: COOPERE, objet: b }
          : { sujet: alea.reel() < 0.5 ? a : b, relation: TRANSMET, objet: alea.reel() < 0.5 ? b : a },
      );
    }

    // Une transmission tirée au hasard peut relier une entité à elle-même après
    // le brassage ci-dessus : on l'écarte plutôt que de l'afficher.
    const propres = faits.filter((f) => f.sujet !== f.objet);
    return {
      systeme: 'digraph',
      entites,
      faits: alea.melanger(propres),
      modele: { aretes: propres },
    };
  },

  rendu: 'graphe',
};
