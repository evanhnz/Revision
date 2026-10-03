/**
 * Système `poset` : un ordre partiel, sous deux préréglages.
 *
 * Trois relations — « précède », « suit », « est incomparable à » — et une
 * difficulté que le cahier des charges laissait ouverte : il décrit `poset`
 * comme un **monde clos**, où l'absence de relation énoncée signifie
 * l'incomparabilité *réelle*. Or les moteurs d'indétermination demandent
 * « quelles relations restent possibles » pour une paire non précisée, question
 * qui n'a aucun sens en monde clos, où rien n'est jamais « encore possible ».
 *
 * D'où deux préréglages du même module, comme prévu dans PLAN.md :
 *
 *  - **`poset`**, clos : les faits énoncés décrivent le diagramme complet.
 *    C'est la version des moteurs d'induction et d'isomorphisme, où l'on lit une
 *    structure donnée.
 *  - **`poset-ouvert`**, ouvert : les faits sont un extrait, et le reste est
 *    à déduire. C'est la version de la catégorie « information incomplète ».
 *
 * **La cohérence de chemin ne suffit pas** sur l'ordre partiel. La composition
 * y est faible — « précède » composée avec « est incomparable à » ne restreint
 * presque rien —, et un réseau peut être cohérent par chemin sans admettre
 * aucun ordre partiel réel : la transitivité de l'incomparabilité fait défaut,
 * et c'est elle qui manque à la propagation. `poset-ouvert` déclare donc
 * `cheminComplet: false` et passe par l'énumération de scénarios. C'est le
 * premier système à le faire, avant RCC8 et Allen — ce qui a l'avantage de
 * mettre le solveur exact à l'épreuve sur une algèbre à trois relations plutôt
 * que sur une à treize.
 */
import type { Alea, Fait, Instance, Modele, Systeme } from './types';

const PRECEDE = 'precede';
const SUIT = 'suit';
const INCOMPARABLE = 'incomparable';

const NOMS = ['Actos', 'Brume', 'Calix', 'Doran', 'Elvas', 'Forge', 'Gemme'];

/**
 * La table de composition de l'ordre partiel.
 *
 * Seule la première ligne est informative : précède ∘ précède = précède, par
 * transitivité. Tout le reste est ouvert, et c'est précisément ce qui rend la
 * propagation insuffisante — la table ne sait rien dire de deux éléments reliés
 * par une incomparabilité.
 */
const TOUT = [PRECEDE, SUIT, INCOMPARABLE];
const COMPOSITION: Record<string, Record<string, string[]>> = {
  [PRECEDE]: {
    [PRECEDE]: [PRECEDE],
    [SUIT]: TOUT,
    [INCOMPARABLE]: [PRECEDE, INCOMPARABLE],
  },
  [SUIT]: {
    [PRECEDE]: TOUT,
    [SUIT]: [SUIT],
    [INCOMPARABLE]: [SUIT, INCOMPARABLE],
  },
  [INCOMPARABLE]: {
    [PRECEDE]: [PRECEDE, INCOMPARABLE],
    [SUIT]: [SUIT, INCOMPARABLE],
    [INCOMPARABLE]: TOUT,
  },
};

const CONVERSES: Record<string, string> = {
  [PRECEDE]: SUIT,
  [SUIT]: PRECEDE,
  [INCOMPARABLE]: INCOMPARABLE,
};

/**
 * Le modèle est une relation de précédence **transitive** : `apres[a]` liste
 * tout ce que `a` précède, directement ou non. La clôture est faite au tirage,
 * de sorte que la lecture soit un simple test d'appartenance.
 */
function lire(modele: Modele, a: string, b: string): string {
  const apres = modele.apres ?? {};
  if (apres[a]?.includes(b)) return PRECEDE;
  if (apres[b]?.includes(a)) return SUIT;
  return INCOMPARABLE;
}

/**
 * Tire un ordre partiel par couches, puis en ferme la transitivité.
 *
 * Passer par des couches plutôt que par des arêtes indépendantes garantit
 * l'**acyclicité** sans avoir à la vérifier : une arête ne va jamais que d'une
 * couche vers une couche strictement postérieure. Et laisser des paires sans
 * arête à l'intérieur d'une couche comme entre deux couches est ce qui produit
 * l'incomparabilité — sans quoi l'ordre serait total et le système se
 * confondrait avec `line`.
 */
function tirer(difficulte: number, alea: Alea): { entites: string[]; apres: Record<string, string[]> } {
  const nombre = Math.min(NOMS.length, 4 + Math.floor(difficulte / 2));
  const entites = alea.plusieurs(NOMS, nombre);

  const melange = alea.melanger(entites);
  const couches: string[][] = [];
  let reste = [...melange];
  while (reste.length) {
    const taille = Math.max(1, Math.min(reste.length, 1 + alea.entier(2)));
    couches.push(reste.slice(0, taille));
    reste = reste.slice(taille);
  }

  const direct: Record<string, string[]> = {};
  for (const entite of entites) direct[entite] = [];
  for (let c = 0; c + 1 < couches.length; c += 1) {
    for (const haut of couches[c]) {
      for (const bas of couches[c + 1]) {
        // Une arête sur deux en moyenne : assez pour relier, assez peu pour
        // laisser de l'incomparabilité.
        if (alea.reel() < 0.65) direct[haut].push(bas);
      }
    }
    // Chaque couche doit avoir au moins une arête sortante, sinon le diagramme
    // se scinde en composantes sans aucune comparabilité entre elles.
    if (!couches[c].some((haut) => direct[haut].length)) {
      direct[alea.un(couches[c])].push(alea.un(couches[c + 1]));
    }
  }

  // Clôture transitive, par parcours depuis chaque sommet.
  const apres: Record<string, string[]> = {};
  for (const depart of entites) {
    const vus = new Set<string>();
    const pile = [...direct[depart]];
    while (pile.length) {
      const courant = pile.pop() as string;
      if (vus.has(courant)) continue;
      vus.add(courant);
      pile.push(...direct[courant]);
    }
    apres[depart] = [...vus];
  }
  return { entites, apres };
}

interface Reglage {
  id: string;
  nom: string;
  resume: string;
  monde: 'clos' | 'ouvert';
  /** Part des paires dont le fait est énoncé. 1 en monde clos. */
  divulgation: number;
}

function construire(reglage: Reglage): Systeme {
  return {
    id: reglage.id,
    nom: reglage.nom,
    resume: reglage.resume,
    // Le préréglage clos sert aussi les moteurs d'isomorphisme, qui ne lisent
    // que le motif des arêtes : il déclare donc les deux régimes.
    regimes: reglage.monde === 'clos' ? ['algebre', 'clos'] : ['algebre'],
    relations: [
      { id: PRECEDE, libelle: 'précède', bref: 'précède', algebre: 'ordre' },
      { id: SUIT, libelle: 'suit', bref: 'suit' },
      { id: INCOMPARABLE, libelle: 'est incomparable à', bref: 'incomp.' },
    ],
    monde: reglage.monde,
    converse: (relation) => CONVERSES[relation] ?? relation,
    composer: (r, s) => new Set(COMPOSITION[r]?.[s] ?? TOUT),
    // Voir l'en-tête : la propagation ne capture pas l'absence de transitivité
    // de l'incomparabilité. Le préréglage clos n'a pas de paire ouverte, la
    // question ne s'y pose donc pas.
    cheminComplet: reglage.monde === 'clos',
    relationDansModele: lire,

    engendrer(difficulte: number, alea: Alea): Instance {
      const { entites, apres } = tirer(difficulte, alea);
      const modele: Modele = { apres };

      const paires: [string, string][] = [];
      for (let i = 0; i < entites.length; i += 1) {
        for (let j = i + 1; j < entites.length; j += 1) paires.push([entites[i], entites[j]]);
      }

      const tous: Fait[] = paires.map(([a, b]) => ({
        sujet: a,
        relation: lire(modele, a, b),
        objet: b,
      }));

      if (reglage.divulgation >= 1) {
        // Monde clos : on n'énonce que les comparabilités. L'incomparabilité se
        // lit dans l'absence, ce qui *est* la convention du monde clos — et ce
        // qui évite d'afficher une dizaine de « X est incomparable à Y ».
        const enonces = tous.filter((f) => f.relation !== INCOMPARABLE);
        return { systeme: reglage.id, entites, faits: alea.melanger(enonces), modele };
      }

      const combien = Math.max(2, Math.round(paires.length * reglage.divulgation));
      const choisis = alea.plusieurs(tous, Math.min(combien, tous.length));
      return { systeme: reglage.id, entites, faits: choisis, modele };
    },

    rendu: 'graphe',
  };
}

export const poset = construire({
  id: 'poset',
  nom: 'Ordre partiel',
  resume: "Des éléments dont certains se précèdent et d'autres ne se comparent pas.",
  monde: 'clos',
  divulgation: 1,
});

export const posetOuvert = construire({
  id: 'poset-ouvert',
  nom: 'Ordre partiel incomplet',
  resume: "Un ordre partiel dont on ne connaît qu'une partie des comparaisons.",
  monde: 'ouvert',
  divulgation: 0.5,
});
