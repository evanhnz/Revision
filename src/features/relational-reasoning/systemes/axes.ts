/**
 * Systèmes-produits : `line`, `plane` et `space` construits comme produits
 * d'algèbres de points.
 *
 * C'est la décision de conception dont dépend tout le reste des systèmes
 * spatiaux. « Au nord de » composé avec « à l'est de » donne « au nord-est
 * de », ce qu'aucune table plate de neuf ou vingt-sept relations n'énumère
 * lisiblement : on compose axe par axe, et la relation composite est le
 * n-uplet des relations d'axe. Les moteurs qui effondrent un axe (Projection),
 * en échangent deux (Axis Maps) ou combinent plusieurs axes en un seul mot de
 * relation (Oblique Basis) deviennent alors des manipulations du n-uplet, et
 * non des cas particuliers.
 *
 * Veridical Mapping (phase 9) réutilise le type `Axe` pour sa dimension
 * « position » : plage, pas et rebouclage. Il n'emprunte rien au vocabulaire
 * relationnel, qui ne lui sert à rien.
 */
import type { Alea, Axe, Instance, Modele, Relation, Systeme } from './types';

/** Les trois relations de l'algèbre de points, en codes d'une lettre. */
export const AVANT = 'a';
export const EGAL = 'e';
export const APRES = 'p';

/** Table de composition de l'algèbre de points, version non stricte. */
const COMPOSITION_POINT: Record<string, Record<string, string[]>> = {
  [AVANT]: { [AVANT]: [AVANT], [EGAL]: [AVANT], [APRES]: [AVANT, EGAL, APRES] },
  [EGAL]: { [AVANT]: [AVANT], [EGAL]: [EGAL], [APRES]: [APRES] },
  [APRES]: { [AVANT]: [AVANT, EGAL, APRES], [EGAL]: [APRES], [APRES]: [APRES] },
};

/**
 * Version stricte : l'égalité est exclue du vocabulaire, ce qui vaut pour un
 * ordre strict total. La composition de deux sens opposés ne laisse alors que
 * les deux sens, et non trois relations.
 */
const COMPOSITION_POINT_STRICTE: Record<string, Record<string, string[]>> = {
  [AVANT]: { [AVANT]: [AVANT], [APRES]: [AVANT, APRES] },
  [APRES]: { [AVANT]: [AVANT, APRES], [APRES]: [APRES] },
};

const CONVERSE_POINT: Record<string, string> = {
  [AVANT]: APRES,
  [EGAL]: EGAL,
  [APRES]: AVANT,
};

/** Un axe strict n'admet pas deux entités à la même position. */
export interface AxeProduit extends Axe {
  strict?: boolean;
}

function relationsAxe(axe: AxeProduit): string[] {
  return axe.strict ? [AVANT, APRES] : [AVANT, EGAL, APRES];
}

function tableAxe(axe: AxeProduit): Record<string, Record<string, string[]>> {
  return axe.strict ? COMPOSITION_POINT_STRICTE : COMPOSITION_POINT;
}

/** Tous les n-uplets de relations d'axe : le vocabulaire du produit. */
function tousLesUplets(axes: AxeProduit[]): string[] {
  let uplets = [''];
  for (const axe of axes) {
    const suivants: string[] = [];
    for (const debut of uplets) for (const r of relationsAxe(axe)) suivants.push(debut + r);
    uplets = suivants;
  }
  return uplets;
}

/**
 * Noms français des combinaisons cardinales à deux axes. Le nommage
 * compositionnel plus bas fonctionne partout, mais « au nord-est de » se lit
 * mieux que « à l'est et au nord de » ; pour trois axes, la composition reprend
 * la main.
 */
const CARDINAUX_2D: Record<string, { libelle: string; bref: string }> = {
  pe: { libelle: "est à l'est de", bref: 'E' },
  ae: { libelle: "est à l'ouest de", bref: 'O' },
  ep: { libelle: 'est au nord de', bref: 'N' },
  ea: { libelle: 'est au sud de', bref: 'S' },
  pp: { libelle: 'est au nord-est de', bref: 'NE' },
  ap: { libelle: 'est au nord-ouest de', bref: 'NO' },
  pa: { libelle: 'est au sud-est de', bref: 'SE' },
  aa: { libelle: 'est au sud-ouest de', bref: 'SO' },
  ee: { libelle: 'occupe la même case que', bref: '=' },
};

/**
 * Nommage compositionnel : un morceau par axe, l'égalité passée sous silence.
 *
 * Exporté parce que les moteurs géométriques en ont besoin : Projection doit
 * nommer un n-uplet dont un axe a été retiré, Échange d'axes un n-uplet dont
 * deux composantes ont été permutées. Ces n-uplets n'appartiennent pas au
 * vocabulaire du système courant — ils appartiennent à celui du système projeté
 * ou transformé —, si bien qu'aucune relation déclarée ne porte leur libellé.
 */
export function nommerUplet(uplet: string, axes: AxeProduit[]): { libelle: string; bref: string } {
  return nommer(uplet, axes);
}

function nommer(uplet: string, axes: AxeProduit[]): { libelle: string; bref: string } {
  if (axes.length === 2 && CARDINAUX_2D[uplet]) return CARDINAUX_2D[uplet];

  const morceaux: string[] = [];
  const brefs: string[] = [];
  uplet.split('').forEach((r, i) => {
    const axe = axes[i];
    if (r === EGAL) return;
    morceaux.push(r === APRES ? axe.versLeHaut : axe.versLeBas);
    brefs.push(r === APRES ? axe.id.toUpperCase() : `−${axe.id.toUpperCase()}`);
  });

  if (!morceaux.length) {
    return { libelle: 'est à la même place que', bref: '=' };
  }
  // « est à l'est de » + « est au nord de » → « est à l'est et au nord de ».
  const sansPrefixe = morceaux.map((m) => m.replace(/^est /, ''));
  return { libelle: `est ${sansPrefixe.join(' et ')}`, bref: brefs.join('') };
}

/** Les entités des instances engendrées, nommées de façon neutre. */
const NOMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export interface OptionsProduit {
  id: string;
  nom: string;
  resume: string;
  axes: AxeProduit[];
  rendu: Systeme['rendu'];
  /**
   * Probabilité qu'une entité partage la position d'une autre sur un axe non
   * strict. Basse mais non nulle : sans elle, « même ligne » n'apparaîtrait
   * jamais dans les énoncés, alors que le vocabulaire la propose.
   */
  chanceDeCoincidence?: number;
}

export function systemeProduit(options: OptionsProduit): Systeme {
  const { axes } = options;
  const uplets = tousLesUplets(axes);

  const relations: Relation[] = uplets.map((uplet) => ({
    id: uplet,
    ...nommer(uplet, axes),
    // Une relation qui ordonne tous les axes est un ordre ; une relation
    // d'égalité sur tous les axes est une équivalence. Les relations mixtes,
    // qui ordonnent un axe et égalisent l'autre, ne sont ni l'un ni l'autre
    // et ne sont donc pas proposées à Hidden Algebra.
    algebre: uplet.split('').every((r) => r !== EGAL)
      ? ('ordre' as const)
      : uplet.split('').every((r) => r === EGAL)
        ? ('equivalence' as const)
        : undefined,
  }));

  const converse = (uplet: string) =>
    uplet
      .split('')
      .map((r) => CONVERSE_POINT[r])
      .join('');

  /** Composition composante par composante, puis produit cartésien. */
  const composer = (r: string, s: string): ReadonlySet<string> => {
    let combinaisons = [''];
    for (let i = 0; i < axes.length; i += 1) {
      const possibles = tableAxe(axes[i])[r[i]]?.[s[i]] ?? [];
      const suivantes: string[] = [];
      for (const debut of combinaisons) for (const t of possibles) suivantes.push(debut + t);
      combinaisons = suivantes;
    }
    return new Set(combinaisons);
  };

  const relationDansModele = (modele: Modele, a: string, b: string): string => {
    const ca = modele.coordonnees?.[a];
    const cb = modele.coordonnees?.[b];
    if (!ca || !cb) return uplets[0];
    return ca
      .map((valeur, i) => {
        if (valeur === cb[i]) return EGAL;
        return valeur > cb[i] ? APRES : AVANT;
      })
      .join('');
  };

  const engendrer = (difficulte: number, alea: Alea): Instance => {
    // Trois entités au premier palier, jusqu'à six au dernier.
    const nombre = Math.min(NOMS.length, 3 + Math.floor(difficulte / 2));
    const entites = NOMS.slice(0, nombre);
    const chance = options.chanceDeCoincidence ?? 0.18;

    const coordonnees: Record<string, number[]> = {};
    const prises = new Set<string>();
    for (const entite of entites) {
      let point: number[] = [];
      // On retire tant que la case est déjà occupée : deux entités peuvent
      // partager une ligne, jamais une case entière.
      for (let essai = 0; essai < 50; essai += 1) {
        point = axes.map((axe, i) => {
          const dejaVues = Object.values(coordonnees).map((c) => c[i]);
          if (!axe.strict && dejaVues.length && alea.reel() < chance) {
            return alea.un(dejaVues);
          }
          return alea.entier(axe.taille);
        });
        if (!prises.has(point.join(','))) break;
      }
      prises.add(point.join(','));
      coordonnees[entite] = point;
    }

    const modele: Modele = { coordonnees };

    // Les faits énoncés forment une chaîne couvrant toutes les entités, plus
    // quelques arêtes de plus aux paliers élevés : une chaîne laisse toujours
    // de l'indétermination, ce dont vivent les moteurs de la catégorie C.
    const ordre = alea.melanger(entites);
    const faits = ordre.slice(1).map((entite, i) => ({
      sujet: entite,
      relation: relationDansModele(modele, entite, ordre[i]),
      objet: ordre[i],
    }));

    const supplementaires = Math.max(0, Math.floor((difficulte - 4) / 2));
    for (let n = 0; n < supplementaires; n += 1) {
      const [sujet, objet] = alea.plusieurs(entites, 2);
      if (faits.some((f) => f.sujet === sujet && f.objet === objet)) continue;
      faits.push({ sujet, relation: relationDansModele(modele, sujet, objet), objet });
    }

    return { systeme: options.id, entites, faits: alea.melanger(faits), modele };
  };

  return {
    id: options.id,
    nom: options.nom,
    resume: options.resume,
    // Les systèmes-produits servent l'algèbre, le monde clos par leurs
    // prédicats d'adjacence, et les transformations par leurs axes.
    regimes: axes.length > 1 ? ['algebre', 'clos', 'transformation'] : ['algebre', 'clos'],
    relations,
    axes,
    monde: 'ouvert',
    converse,
    composer,
    // L'algèbre de points est traitable : la cohérence de chemin y décide seule
    // quelles relations restent possibles, et le produit d'algèbres traitables
    // l'est encore, chaque axe se propageant indépendamment.
    cheminComplet: true,
    engendrer,
    relationDansModele,
    rendu: options.rendu,
  };
}
