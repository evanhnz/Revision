/**
 * Composition d'une session et tirage d'un essai.
 *
 * Un essai est un **choix forcé à deux alternatives** : une référence sur la
 * dimension de départ, deux candidats sur la dimension d'arrivée, dont un seul
 * est au même niveau relatif. C'est ce format qui donne à l'escalier son point
 * de convergence connu — 70,7 % de réussite, bien au-dessus du hasard à 50 %.
 *
 * La **charge** ajoute des sous-essais sur le même écran plutôt que des
 * candidats : ajouter des candidats changerait le niveau du hasard, donc le
 * point de convergence, et rendrait les seuils incomparables d'une charge à
 * l'autre. Plusieurs sous-essais côte à côte augmentent ce qu'il faut tenir en
 * tête sans toucher à la mesure — ce que le cahier des charges demande
 * précisément : une difficulté indépendante du seuil perceptif.
 */
import { PAS, borner, ecartEnPas, type Famille } from './dimensions';
import { arbreCouvrant, aretesDeFamille, aretesHorsFamille, idArete, type Arete } from './hub';
import { stimulus, superposables, superposer, type Stimulus } from './stimulus';

export type Mode = 'squelette' | 'exhaustif';

/**
 * La tâche : ce que « la même valeur » veut dire.
 *
 * Les trois tâches ne sont pas trois niveaux de difficulté d'une même question,
 * elles posent trois questions différentes — et la troisième est la seule où la
 * réponse ne porte pas sur une valeur.
 *
 *  - **`point`** : une valeur sur la dimension de départ, une valeur sur celle
 *    d'arrivée, au même rang. C'est la tâche de base.
 *  - **`plan`** : un **couple** de valeurs, porté par un seul objet — un disque
 *    à la fois grand et clair. Le leurre ne se trompe que sur **un** des deux
 *    axes, et l'on ne sait pas lequel : il faut donc tenir les deux, sans quoi
 *    une moitié des essais serait perdue au hasard.
 *  - **`modulaire`** : la dimension d'arrivée **reboucle**, et il n'y a donc pas
 *    d'origine privilégiée. « Le même rang » n'y veut rien dire ; seul
 *    l'**intervalle** entre deux valeurs se transporte. On montre donc deux
 *    références et l'on demande le couple qui reproduit leur écart, à un
 *    décalage près. C'est la mise en correspondance d'une **structure** et non
 *    d'un point.
 */
export type Tache = 'point' | 'plan' | 'modulaire';

export const LONGUEURS = [48, 96, 160] as const;

export interface Reglages {
  famille: Famille;
  mode: Mode;
  tache: Tache;
  essais: number;
  /** Sous-essais par écran, de 1 à 3. */
  charge: number;
  /** Ouvrir les paires qui franchissent la frontière des familles. */
  horsFamille: boolean;
  /** Brouiller les attributs sans rapport des candidats. */
  bruit: boolean;
  /** Ne montrer qu'une partie de la référence. */
  partiel: boolean;
}

export const REGLAGES_PAR_DEFAUT: Reglages = {
  famille: 'prothetique',
  mode: 'squelette',
  tache: 'point',
  essais: 48,
  charge: 1,
  horsFamille: false,
  bruit: false,
  partiel: false,
};

export interface Candidat {
  pas: number;
  stimulus: Stimulus;
  juste: boolean;
  /** Teinte parasite, quand le bruit de surface est actif. */
  parasite?: number;
  /**
   * En tâche modulaire, le premier élément du couple candidat : c'est l'écart
   * entre lui et `pas` qui est jugé, non la position de l'un ou de l'autre.
   */
  ancre?: number;
  ancreStimulus?: Stimulus;
}

export interface SousEssai {
  pasReference: number;
  reference: Stimulus;
  candidats: Candidat[];
  /**
   * Seconde référence, pour la tâche modulaire : c'est l'écart entre les deux
   * qu'il faut reproduire, non leur position.
   */
  pasReference2?: number;
  reference2?: Stimulus;
}

export interface Essai {
  arete: Arete;
  delta: number;
  sousEssais: SousEssai[];
  /** La référence n'est montrée qu'en partie : il faut la compléter. */
  partiel: boolean;
  tache: Tache;
  /**
   * La seconde dimension du couple, en tâche « plan ». Les stimulus la portent
   * déjà ; on la nomme ici pour la consigne et le tableau de bord.
   */
  secondaire?: { de: string; vers: string };
  /** L'écart à reproduire, en tâche modulaire. */
  intervalle?: number;
}

export interface Hasard {
  reel(): number;
  entier(borne: number): number;
}

/**
 * Le vivier d'arêtes d'une session.
 *
 * En mode squelette, les n−1 paires de l'arbre couvrant, dans leurs deux sens :
 * le minimum pour relier toutes les dimensions de la famille, sans repasser par
 * les paires redondantes. En mode exhaustif, toutes les arêtes.
 */
export function vivierDAretes(
  reglages: Reglages,
  essaisDeLaPaire: (a: string, b: string) => number,
): Arete[] {
  const toutes = aretesDeFamille(reglages.famille);
  const base =
    reglages.mode === 'exhaustif'
      ? toutes
      : arbreCouvrant(reglages.famille, essaisDeLaPaire).flatMap((paire) =>
          toutes.filter(
            (arete) =>
              (arete.de.id === paire.a.id && arete.vers.id === paire.b.id) ||
              (arete.de.id === paire.b.id && arete.vers.id === paire.a.id),
          ),
        );

  const avecHorsFamille = reglages.horsFamille
    ? [
        ...base,
        ...aretesHorsFamille().filter(
          (arete) =>
            arete.de.famille === reglages.famille || arete.vers.famille === reglages.famille,
        ),
      ]
    : base;

  return restreindreALaTache(avecHorsFamille, reglages.tache);
}

/**
 * Restreint le vivier aux arêtes sur lesquelles la tâche a un sens.
 *
 * Sans cette restriction, choisir la tâche modulaire n'aurait d'effet que sur la
 * fraction des arêtes arrivant sur la teinte, et le tirage retomberait
 * silencieusement sur la tâche de base pour toutes les autres. Un réglage qui
 * n'agit qu'une fois sur cinq est pire qu'un réglage absent : on croit mesurer
 * une chose et l'on en mesure deux, mélangées sous la même clef de seuil.
 *
 * Si la restriction vide le vivier, on rend le vivier **non restreint** plutôt
 * qu'une liste vide : l'appelant vérifie déjà que le vivier n'est pas vide pour
 * refuser de commencer, et l'interface désactive la tâche en amont. Rendre vide
 * ici transformerait une tâche indisponible en session impossible à lancer sans
 * explication.
 */
function restreindreALaTache(aretes: readonly Arete[], tache: Tache): Arete[] {
  if (tache === 'modulaire') {
    const circulaires = aretes.filter((arete) => arete.vers.circulaire);
    return circulaires.length ? circulaires : [...aretes];
  }
  if (tache === 'plan') {
    // Il faut qu'une seconde paire superposable existe, sinon `tirerPlan`
    // retombe sur la tâche de base.
    const utilisables = aretes.filter((arete) =>
      aretes.some(
        (autre) =>
          autre.de.id !== arete.de.id &&
          autre.vers.id !== arete.vers.id &&
          superposables(autre.de, arete.de) &&
          superposables(autre.vers, arete.vers),
      ),
    );
    return utilisables.length ? utilisables : [...aretes];
  }
  return [...aretes];
}

/** La charge n'est portée que par les arêtes entièrement visuelles. */
export function chargeAdmise(arete: Arete, charge: number): number {
  const toutVisuel = arete.de.modalite === 'visuelle' && arete.vers.modalite === 'visuelle';
  return toutVisuel ? Math.max(1, Math.min(3, charge)) : 1;
}

/**
 * Tire un essai sur une arête, à l'écart courant de son escalier.
 *
 * La référence est choisie avec une marge suffisante pour que le leurre reste
 * dans la plage — sauf sur une dimension circulaire, où il n'y a pas de bord.
 */
export function tirerEssai(
  arete: Arete,
  delta: number,
  reglages: Reglages,
  hasard: Hasard,
): Essai {
  if (reglages.tache === 'plan') return tirerPlan(arete, delta, reglages, hasard);
  if (reglages.tache === 'modulaire' && arete.vers.circulaire) {
    return tirerModulaire(arete, delta, reglages, hasard);
  }

  const ecart = Math.max(1, Math.round(delta));
  const charge = chargeAdmise(arete, reglages.charge);
  const sousEssais: SousEssai[] = [];

  for (let n = 0; n < charge; n += 1) {
    const marge = arete.vers.circulaire ? 0 : ecart;
    const etendue = Math.max(1, PAS - 2 * marge);
    const pasReference = arete.de.circulaire
      ? hasard.entier(PAS)
      : marge + hasard.entier(etendue);

    const sens = hasard.reel() < 0.5 ? -1 : 1;
    const pasLeurre = borner(arete.vers, pasReference + sens * ecart);

    const candidats: Candidat[] = [
      { pas: pasReference, stimulus: stimulus(arete.vers, pasReference), juste: true },
      { pas: pasLeurre, stimulus: stimulus(arete.vers, pasLeurre), juste: false },
    ];
    // Bruit de surface : une teinte parasite différente par candidat, qui ne
    // dit rien du niveau et qu'il faut apprendre à ignorer. On ne l'applique
    // pas quand c'est justement la teinte qu'on compare.
    if (reglages.bruit && arete.vers.id !== 'teinte') {
      for (const candidat of candidats) candidat.parasite = hasard.entier(360);
    }
    if (hasard.reel() < 0.5) candidats.reverse();

    sousEssais.push({
      pasReference,
      reference: stimulus(arete.de, pasReference),
      candidats,
    });
  }

  return { arete, delta: ecart, sousEssais, partiel: reglages.partiel, tache: 'point' };
}

/**
 * Tâche « plan » : un couple de valeurs à transporter.
 *
 * La référence porte deux valeurs superposées, sur l'arête donnée et sur une
 * seconde arête tirée parmi les dimensions superposables. Les deux candidats
 * portent eux aussi un couple, et **le leurre ne se trompe que sur un seul
 * axe** — tiré au hasard, si bien qu'on ne sait pas lequel surveiller.
 *
 * C'est le point de conception à tenir. Un leurre faux sur les **deux** axes
 * serait plus facile, pas plus dur : la moindre des deux différences suffirait
 * à le démasquer, et la tâche se réduirait au meilleur des deux seuils. En
 * n'introduisant qu'une seule erreur, on force à tenir les deux axes à la fois
 * sans changer le niveau du hasard, qui reste à **50 %** : le point de
 * convergence de l'escalier, et donc la comparabilité des seuils, est préservé.
 */
function tirerPlan(arete: Arete, delta: number, reglages: Reglages, hasard: Hasard): Essai {
  const ecart = Math.max(1, Math.round(delta));

  // La seconde paire est cherchée dans le vivier de la **tâche de base** : la
  // restriction propre à « plan » ne s'applique qu'à l'arête principale, celle
  // dont le seuil est mesuré. La seconde n'a qu'à être superposable.
  const candidates = vivierDAretes({ ...reglages, tache: 'point' }, () => 0).filter(
    (autre) =>
      superposables(autre.de, arete.de) &&
      superposables(autre.vers, arete.vers) &&
      autre.de.id !== arete.de.id &&
      autre.vers.id !== arete.vers.id,
  );
  // Aucune seconde paire disponible : on retombe sur la tâche de base plutôt que
  // de fabriquer un couple dégénéré dont un axe serait constant.
  if (!candidates.length) {
    return tirerEssai(arete, delta, { ...reglages, tache: 'point' }, hasard);
  }
  const seconde = candidates[hasard.entier(candidates.length)];

  const marge = arete.vers.circulaire ? 0 : ecart;
  const marge2 = seconde.vers.circulaire ? 0 : ecart;
  const pasA = arete.de.circulaire ? hasard.entier(PAS) : marge + hasard.entier(Math.max(1, PAS - 2 * marge));
  const pasB = seconde.de.circulaire ? hasard.entier(PAS) : marge2 + hasard.entier(Math.max(1, PAS - 2 * marge2));

  // Un seul axe fautif, tiré au hasard.
  const axeFautif = hasard.reel() < 0.5 ? 0 : 1;
  const sens = hasard.reel() < 0.5 ? -1 : 1;
  const leurreA = axeFautif === 0 ? borner(arete.vers, pasA + sens * ecart) : pasA;
  const leurreB = axeFautif === 1 ? borner(seconde.vers, pasB + sens * ecart) : pasB;

  const candidats: Candidat[] = [
    {
      pas: pasA,
      stimulus: superposer(stimulus(arete.vers, pasA), stimulus(seconde.vers, pasB)),
      juste: true,
    },
    {
      pas: leurreA,
      stimulus: superposer(stimulus(arete.vers, leurreA), stimulus(seconde.vers, leurreB)),
      juste: false,
    },
  ];
  if (hasard.reel() < 0.5) candidats.reverse();

  return {
    arete,
    delta: ecart,
    partiel: reglages.partiel,
    tache: 'plan',
    secondaire: { de: seconde.de.id, vers: seconde.vers.id },
    sousEssais: [
      {
        pasReference: pasA,
        reference: superposer(stimulus(arete.de, pasA), stimulus(seconde.de, pasB)),
        candidats,
      },
    ],
  };
}

/**
 * Tâche « modulaire » : transporter un **intervalle** sur une dimension qui
 * reboucle.
 *
 * Sur un cercle, il n'y a pas d'origine. Demander « la même valeur » n'a donc
 * aucun sens : une teinte n'est pas « au rang 30 » dans l'absolu, elle est à
 * trente pas de n'importe quelle autre. Ce qui se transporte d'une droite vers un
 * cercle, c'est l'**écart** entre deux valeurs — et lui seul.
 *
 * On montre donc **deux** références sur la dimension de départ, séparées d'un
 * intervalle tiré au hasard, et deux couples de candidats sur la dimension
 * circulaire. Le couple juste reproduit l'intervalle **à un décalage près**,
 * lequel est tiré indépendamment : sans ce décalage, la réponse se lirait sur la
 * position du premier élément et la tâche redeviendrait celle du point.
 *
 * L'intervalle est choisi assez grand pour que l'erreur de `delta` reste
 * discriminable de lui — un intervalle de trois pas et une erreur de trois pas
 * donneraient deux couples dont l'un a un écart nul, reconnaissable sans
 * comparer.
 */
function tirerModulaire(arete: Arete, delta: number, reglages: Reglages, hasard: Hasard): Essai {
  const ecart = Math.max(1, Math.round(delta));
  // L'intervalle à reproduire : au moins trois fois l'erreur, pour que le leurre
  // ne soit pas identifiable à sa dégénérescence.
  const minimum = Math.min(Math.floor(PAS / 3), 3 * ecart + 2);
  const intervalle = minimum + hasard.entier(Math.max(1, Math.floor(PAS / 3) - minimum + 1));

  const depart = arete.de.circulaire
    ? hasard.entier(PAS)
    : hasard.entier(Math.max(1, PAS - intervalle));
  const pasA = depart;
  const pasB = borner(arete.de, depart + intervalle);

  // Le décalage arbitraire : c'est lui qui rend la tâche structurelle.
  const decalage = hasard.entier(PAS);
  const justeA = borner(arete.vers, decalage);
  const justeB = borner(arete.vers, decalage + intervalle);
  const sens = hasard.reel() < 0.5 ? -1 : 1;
  const fauxB = borner(arete.vers, decalage + intervalle + sens * ecart);

  const candidats: Candidat[] = [
    {
      pas: justeB,
      stimulus: stimulus(arete.vers, justeB),
      juste: true,
      ancre: justeA,
      ancreStimulus: stimulus(arete.vers, justeA),
    },
    {
      pas: fauxB,
      stimulus: stimulus(arete.vers, fauxB),
      juste: false,
      ancre: justeA,
      ancreStimulus: stimulus(arete.vers, justeA),
    },
  ];
  if (hasard.reel() < 0.5) candidats.reverse();

  return {
    arete,
    delta: ecart,
    partiel: reglages.partiel,
    tache: 'modulaire',
    intervalle: ecartEnPas(arete.de, pasA, pasB),
    sousEssais: [
      {
        pasReference: pasA,
        reference: stimulus(arete.de, pasA),
        pasReference2: pasB,
        reference2: stimulus(arete.de, pasB),
        candidats,
      },
    ],
  };
}

/** Identifiant d'arête, réexporté pour les appelants qui n'ont que des chaînes. */
export { idArete };
