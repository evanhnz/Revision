/**
 * Génération des séquences de stimuli pour le Quad N-Back.
 *
 * Portage de la logique de « quad-box » (src/lib/nback.js) :
 *   https://github.com/scottshadow56/quad-box  — licence MIT
 *   Copyright (c) 2025 The Quad Box Project Contributors
 *   Texte complet : src/features/quad-n-back/LICENCE-quad-box.txt
 *
 * Adaptations : suppression des modes « tally », « varying N » et des pools
 * génératifs (d3), conservation des quatre dimensions du Quad N-Back.
 *
 * Principe : pour chaque dimension (position, couleur, forme, son), on décide
 * d'abord QUELLES épreuves seront des correspondances avec l'épreuve n rangs
 * plus tôt, puis on remplit les autres en évitant les collisions entre
 * dimensions.
 */
import { COLOR_POOL, SHAPE_POOL, POSITION_POOL, POSITION_POOL_2D, AUDIO_POOL } from './constantes.js';
import { createVoronoiPool } from './voronoi.js';
import { createArtPool } from './generative.js';

const tirer = (pool) => pool[Math.floor(Math.random() * pool.length)];

const melanger = (tableau) => {
  for (let i = tableau.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tableau[i], tableau[j]] = [tableau[j], tableau[i]];
  }
  return tableau;
};

/**
 * Décide, pour une dimension, quelles épreuves seront des correspondances.
 *
 * La moitié du taux visé est garantie, l'autre moitié est tirée au sort : le
 * nombre de correspondances varie donc d'une partie à l'autre sans jamais
 * s'éloigner beaucoup de la cible. Les n premières épreuves ne peuvent pas
 * être des correspondances (rien à comparer en arrière).
 */
function genererCorrespondances(nombreEpreuves, n, tauxCorrespondance) {
  if (n >= nombreEpreuves) return new Array(nombreEpreuves).fill(false);

  const comparables = nombreEpreuves - n;
  const garanties = (comparables * (tauxCorrespondance / 2)) / 100;
  const reste = comparables - garanties;
  const tauxReste = reste > 0 ? (100 * garanties) / reste : 0;

  let supplementaires = 0;
  for (let i = 0; i < reste; i++) {
    if (Math.random() * 100 < tauxReste) supplementaires++;
  }

  const total = Math.round(garanties + supplementaires);
  const correspondances = new Array(comparables).fill(false);
  for (let i = 0; i < total && i < correspondances.length; i++) correspondances[i] = true;
  melanger(correspondances);

  return new Array(n).fill(false).concat(correspondances);
}

/**
 * Remplit une dimension pour toutes les épreuves.
 *
 * « interference » (0-100) est la probabilité de choisir délibérément un
 * stimulus proche d'une correspondance (celui de n-1 ou n+1 rangs en arrière)
 * quand l'épreuve ne doit PAS en être une : c'est ce qui rend l'exercice
 * réellement difficile plutôt que simplement rapide.
 */
function remplirDimension(epreuves, dimensions, dimension, pool, n, tauxCorrespondance, interference) {
  const correspondances = genererCorrespondances(epreuves.length, n, tauxCorrespondance);
  const autres = dimensions.filter((d) => d !== dimension);

  for (let i = 0; i < epreuves.length; i++) {
    // On évite qu'une même valeur serve simultanément à deux dimensions.
    let interdits = autres.map((d) => epreuves[i][d]).filter(Boolean);
    let disponibles = pool.filter((s) => !interdits.includes(s));

    if (i < n) {
      epreuves[i][dimension] = tirer(disponibles);
      continue;
    }

    interdits = interdits.concat(autres.map((d) => epreuves[i - n][d]).filter(Boolean));
    disponibles = pool.filter((s) => !interdits.includes(s));

    if (correspondances[i]) {
      epreuves[i][dimension] = epreuves[i - n][dimension];
      epreuves[i].correspondances.push(dimension);
      continue;
    }

    const possibles = disponibles.filter((s) => s !== epreuves[i - n][dimension]);
    let leurres = [epreuves[i - n + 1]?.[dimension]];
    if (i - n - 1 >= 0) leurres.push(epreuves[i - n - 1][dimension]);
    leurres = leurres.filter((s) => s && possibles.includes(s));
    melanger(leurres);

    epreuves[i][dimension] =
      Math.random() * 100 < interference && leurres.length > 0 ? leurres[0] : tirer(possibles);
  }
}

/**
 * Dimensions disponibles.
 *
 * « motif » correspond au « Pattern » de quad-box : il remplace le couple
 * couleur + forme par une image générée, et s'exclut donc mutuellement
 * avec elles — comme dans le dépôt d'origine.
 */
export const DIMENSIONS = [
  { cle: 'position', libelle: 'Position', touche: 'a', description: 'La case occupée' },
  { cle: 'couleur', libelle: 'Couleur', touche: 's', description: 'La couleur du bloc' },
  { cle: 'forme', libelle: 'Forme', touche: 'd', description: 'La forme affichée' },
  { cle: 'son', libelle: 'Son', touche: 'f', description: 'La lettre prononcée' },
  { cle: 'motif', libelle: 'Motif', touche: 'g', description: 'Le dessin affiché' },
];

/** Dimensions incompatibles entre elles (le motif porte déjà forme et couleur). */
export const EXCLUSIONS = { motif: ['couleur', 'forme'], couleur: ['motif'], forme: ['motif'] };

/** Sources de motifs, comme dans quad-box. */
export const SOURCES_MOTIF = [
  { cle: 'voronoi', libelle: 'Voronoï' },
  { cle: 'generatif', libelle: 'Art génératif' },
];

/**
 * Construit une partie complète.
 *
 * @param {object} reglages
 * @param {number} reglages.n            profondeur (n-back)
 * @param {number} reglages.epreuves     nombre d'épreuves
 * @param {string[]} reglages.dimensions dimensions actives
 * @param {boolean} reglages.grille3D    grille 3×3×3 (sinon 3×3)
 * @param {number} reglages.tauxCorrespondance pourcentage visé de correspondances
 * @param {number} reglages.interference probabilité de leurres (0-100)
 */
export function genererPartie(reglages) {
  const {
    n,
    epreuves: nombreEpreuves,
    dimensions,
    grille3D = true,
    tauxCorrespondance = 25,
    interference = 20,
    sourceMotif = 'voronoi',
  } = reglages;

  const epreuves = new Array(nombreEpreuves).fill(null).map(() => ({
    correspondances: [],
    reponses: {},
  }));

  const pools = {
    position: grille3D ? POSITION_POOL : POSITION_POOL_2D,
    couleur: COLOR_POOL,
    forme: SHAPE_POOL,
    son: AUDIO_POOL,
    // Le vivier de motifs est régénéré à chaque partie : les dessins ne se
    // répètent pas d'une session à l'autre, ce qui empêche de les mémoriser.
    motif: dimensions.includes('motif')
      ? sourceMotif === 'generatif'
        ? createArtPool()
        : createVoronoiPool()
      : [],
  };

  // La position n'entre pas en collision avec les autres dimensions : elle est
  // remplie à part, avec sa propre liste de dimensions concurrentes vide.
  for (const dimension of dimensions) {
    const concurrentes = dimension === 'position' ? [] : dimensions.filter((d) => d !== 'position');
    remplirDimension(
      epreuves,
      concurrentes,
      dimension,
      pools[dimension],
      n,
      tauxCorrespondance,
      interference,
    );
  }

  return {
    meta: {
      n,
      nombreEpreuves,
      dimensions: [...dimensions],
      grille3D,
      tauxCorrespondance,
      interference,
      sourceMotif,
      titre: titrePartie(dimensions),
    },
    epreuves,
  };
}

/**
 * Identifiant du mode de jeu.
 * Il sert à la progression automatique, qui ne compare entre elles que les
 * parties de même mode : passer de Dual à Quad ne doit pas faire monter le
 * niveau. La liste triée garantit un identifiant stable.
 */
export function titrePartie(dimensions) {
  const nombre = dimensions.length;
  const nom = { 1: 'Simple', 2: 'Dual', 3: 'Tri', 4: 'Quad', 5: 'Penta' }[nombre] ?? `${nombre}D`;
  return `${nom}:${[...dimensions].sort().join('+')}`;
}

/** Nom lisible d'un mode, sans la liste des dimensions. */
export const nomMode = (titre) => String(titre ?? '').split(':')[0];

/**
 * Calcule le score d'une partie terminée, selon le barème de quad-box.
 *
 * Seules les décisions engageantes sont comptées :
 *   - réussite  : une correspondance signalée à temps ;
 *   - échec     : une fausse alerte, ou une correspondance manquée.
 * Ne rien signaler quand il n'y avait rien à signaler n'entre pas dans le
 * calcul. Le taux vaut donc réussites / (réussites + échecs) : rester passif
 * donne 0 %, et signaler tout systématiquement s'effondre aussi, puisque
 * chaque pression injustifiée compte comme un échec.
 *
 * C'est le barème auquel sont calibrés les seuils de progression (80 % / 50 %)
 * repris du dépôt d'origine.
 */
export function calculerScore(partie) {
  const { epreuves, meta } = partie;
  const parDimension = {};
  let reussites = 0;
  let echecs = 0;

  for (const dimension of meta.dimensions) {
    let vraisPositifs = 0;
    let fauxPositifs = 0;
    let oublis = 0;

    epreuves.forEach((epreuve, i) => {
      if (i < meta.n) return; // épreuves sans point de comparaison
      const attendu = epreuve.correspondances.includes(dimension);
      const signale = epreuve.reponses[dimension] === true;
      if (attendu && signale) vraisPositifs++;
      else if (attendu && !signale) oublis++;
      else if (!attendu && signale) fauxPositifs++;
      // sinon : rejet correct, non comptabilisé
    });

    const comptees = vraisPositifs + fauxPositifs + oublis;
    parDimension[dimension] = {
      vraisPositifs,
      fauxPositifs,
      oublis,
      comptees,
      taux: comptees > 0 ? vraisPositifs / comptees : 0,
    };
    reussites += vraisPositifs;
    echecs += fauxPositifs + oublis;
  }

  const comptees = reussites + echecs;
  return {
    parDimension,
    taux: comptees > 0 ? reussites / comptees : 0,
    reperees: reussites,
    aReperer: reussites + Object.values(parDimension).reduce((n, d) => n + d.oublis, 0),
    erreurs: echecs,
  };
}

// --- Progression automatique du niveau -------------------------------------

/**
 * Réglages de progression, repris tels quels de quad-box.
 * Monter demande une seule partie au-dessus de 80 % ; redescendre en demande
 * trois de suite sous 50 %, pour qu'une mauvaise session isolée ne fasse pas
 * reculer.
 */
export const PROGRESSION_DEFAUT = {
  active: true,
  seuilMontee: 80,
  partiesMontee: 1,
  seuilDescente: 50,
  partiesDescente: 3,
};

export const N_MAXIMAL = 12;

/** Éléments du tableau jusqu'au premier qui vérifie la condition (exclu). */
const jusqua = (tableau, condition) => {
  const i = tableau.findIndex(condition);
  return i === -1 ? tableau.slice() : tableau.slice(0, i);
};

/**
 * Décide du niveau de la partie suivante.
 *
 * Reproduit `runAutoProgression` de quad-box : on ne compare entre elles que
 * les parties récentes (48 h) du même mode et du même niveau, et on s'arrête
 * au dernier « jalon » — la marque posée lors du précédent changement de
 * niveau, qui empêche de recompter des parties déjà prises en compte.
 *
 * @param {object} partieCourante  { titre, n, taux }
 * @param {Array}  sessions        sessions enregistrées, les plus récentes d'abord
 * @param {object} reglages        PROGRESSION_DEFAUT ou équivalent
 * @returns {{ n: number, decision: 'montee'|'descente'|'stable' }}
 */
export function progressionAutomatique(partieCourante, sessions, reglages = PROGRESSION_DEFAUT) {
  const stable = { n: partieCourante.n, decision: 'stable' };
  if (!reglages.active) return stable;

  const limite = Date.now() - 48 * 60 * 60 * 1000;
  const comparables = sessions
    .filter((s) => new Date(s.le).getTime() >= limite)
    .filter((s) => s.titre === partieCourante.titre && s.n === partieCourante.n);

  const applicables = jusqua(comparables, (s) => s.statut === 'jalon');

  const pourMontee = applicables.slice(0, reglages.partiesMontee);
  if (
    pourMontee.length >= reglages.partiesMontee &&
    pourMontee.every((s) => s.taux * 100 >= reglages.seuilMontee)
  ) {
    return { n: Math.min(partieCourante.n + 1, N_MAXIMAL), decision: 'montee' };
  }

  const pourDescente = applicables.slice(0, reglages.partiesDescente);
  if (
    pourDescente.length >= reglages.partiesDescente &&
    pourDescente.every((s) => s.taux * 100 < reglages.seuilDescente)
  ) {
    return { n: Math.max(partieCourante.n - 1, 1), decision: 'descente' };
  }

  return stable;
}
