/**
 * Système `groups` : des équipes, alliées ou rivales.
 *
 * L'algèbre est celle de l'équilibre structurel : deux alliés d'un même tiers
 * sont alliés, un allié d'un rival est un rival. Autrement dit le groupe Z₂,
 * où « rival » joue le rôle du signe négatif. La composition est donc
 * **fonctionnelle** — elle donne toujours une seule relation —, ce qui fait de
 * ce système le plus déterminé des neuf : une chaîne de faits couvrant toutes
 * les entités fixe entièrement le réseau.
 *
 * C'est une qualité pour les moteurs qui demandent d'inférer une algèbre, où
 * la structure doit se laisser deviner sans ambiguïté ; c'est une raison de
 * l'écarter des moteurs qui vivent de l'indétermination, qui n'y trouveraient
 * jamais de paire ouverte. Le catalogue des moteurs le déclare (`compatible`).
 *
 * Conséquence du même fait : tout réseau engendré est nécessairement
 * équilibré. On tire donc les instances d'une partition en deux camps, jamais
 * d'arêtes indépendantes — un tirage arête par arête produirait presque
 * toujours un triangle impossible.
 */
import type { Alea, Instance, Modele, Systeme } from './types';

const ALLIE = 'allie';
const RIVAL = 'rival';

const NOMS = ['Adrar', 'Belon', 'Cursan', 'Doria', 'Estel', 'Fajol', 'Gavre'];

const COMPOSITION: Record<string, Record<string, string[]>> = {
  [ALLIE]: { [ALLIE]: [ALLIE], [RIVAL]: [RIVAL] },
  [RIVAL]: { [ALLIE]: [RIVAL], [RIVAL]: [ALLIE] },
};

function relationDansModele(modele: Modele, a: string, b: string): string {
  const camps = modele.camps ?? {};
  return camps[a] === camps[b] ? ALLIE : RIVAL;
}

export const groups: Systeme = {
  id: 'groups',
  nom: 'Équipes',
  resume: 'Des équipes liées par deux verbes : alliée de, rivale de.',
  regimes: ['algebre', 'transformation'],
  relations: [
    { id: ALLIE, libelle: 'est alliée de', bref: 'allié', algebre: 'equivalence' },
    { id: RIVAL, libelle: 'est rivale de', bref: 'rival', algebre: 'opposition' },
  ],
  monde: 'ouvert',
  // Les deux relations sont symétriques : chacune est sa propre converse.
  converse: (relation) => relation,
  composer: (r, s) => new Set(COMPOSITION[r]?.[s] ?? []),
  // Composition fonctionnelle : la propagation par triangles suffit, car dans
  // un réseau complet toute boucle se décompose en triangles et la parité s'y
  // conserve.
  cheminComplet: true,
  relationDansModele,

  engendrer(difficulte: number, alea: Alea): Instance {
    const nombre = Math.min(NOMS.length, 3 + Math.floor(difficulte / 2));
    const entites = alea.plusieurs(NOMS, nombre);

    // Deux camps, chacun non vide : sans quoi « rivale de » n'apparaîtrait pas.
    const camps: Record<string, number> = {};
    const melange = alea.melanger(entites);
    const coupure = 1 + alea.entier(melange.length - 1);
    melange.forEach((entite, i) => {
      camps[entite] = i < coupure ? 0 : 1;
    });
    const modele: Modele = { camps };

    const ordre = alea.melanger(entites);
    const faits = ordre.slice(1).map((entite, i) => ({
      sujet: entite,
      relation: relationDansModele(modele, entite, ordre[i]),
      objet: ordre[i],
    }));

    return { systeme: 'groups', entites, faits: alea.melanger(faits), modele };
  },

  rendu: 'graphe',
};
