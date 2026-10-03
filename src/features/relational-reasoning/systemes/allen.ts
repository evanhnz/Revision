/**
 * Système `allen` : l'algèbre des intervalles.
 *
 * Treize relations entre deux intervalles de temps, et la plus célèbre des
 * algèbres de relations. Sa table de composition n'est pas recopiée ici : elle
 * est **dérivée** du modèle des segments par énumération exhaustive — voir
 * `noyaux/intervalles.ts`, qui explique pourquoi et à quel prix.
 *
 * **La cohérence de chemin y est incomplète**, et c'est la raison d'être de ce
 * système dans le catalogue. Un réseau de contraintes peut y être parfaitement
 * cohérent par chemin — aucune paire ne se vide par composition — et n'admettre
 * pourtant **aucun** scénario réel. C'est le résultat classique sur lequel repose
 * la distinction, faite dans le noyau algébrique, entre `possibilitesParChemin`
 * et `possibilitesExactes` : sur `line` la première suffit, ici elle ne donne
 * qu'un sur-ensemble, et une réponse calculée par elle contiendrait des relations
 * en réalité impossibles.
 *
 * C'est aussi pourquoi ce système arrive au dernier palier. Non parce que ses
 * treize relations seraient difficiles à retenir — elles se lisent sur un
 * dessin —, mais parce que raisonner juste y demande d'abandonner l'idée que
 * propager suffit.
 */
import { deriverTable, tirerSegments, type Segment } from '../noyaux/intervalles';
import type { Alea, Instance, Modele, Systeme } from './types';

const NOMS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];

/** Les treize relations d'Allen, en codes courts. */
const AVANT = 'b';
const APRES = 'bi';
const RENCONTRE = 'm';
const RENCONTRE_PAR = 'mi';
const CHEVAUCHE = 'o';
const CHEVAUCHE_PAR = 'oi';
const COMMENCE = 's';
const COMMENCE_PAR = 'si';
const PENDANT = 'd';
const CONTIENT = 'di';
const FINIT = 'f';
const FINIT_PAR = 'fi';
const EGALE = 'eq';

const CONVERSES: Record<string, string> = {
  [AVANT]: APRES,
  [APRES]: AVANT,
  [RENCONTRE]: RENCONTRE_PAR,
  [RENCONTRE_PAR]: RENCONTRE,
  [CHEVAUCHE]: CHEVAUCHE_PAR,
  [CHEVAUCHE_PAR]: CHEVAUCHE,
  [COMMENCE]: COMMENCE_PAR,
  [COMMENCE_PAR]: COMMENCE,
  [PENDANT]: CONTIENT,
  [CONTIENT]: PENDANT,
  [FINIT]: FINIT_PAR,
  [FINIT_PAR]: FINIT,
  [EGALE]: EGALE,
};

const LIBELLES: Record<string, { libelle: string; bref: string }> = {
  [AVANT]: { libelle: 'se termine avant le début de', bref: 'avant' },
  [APRES]: { libelle: 'commence après la fin de', bref: 'après' },
  [RENCONTRE]: { libelle: 'se termine exactement où commence', bref: 'rencontre' },
  [RENCONTRE_PAR]: { libelle: 'commence exactement où se termine', bref: 'rencontré' },
  [CHEVAUCHE]: { libelle: 'commence avant et se termine pendant', bref: 'chevauche' },
  [CHEVAUCHE_PAR]: { libelle: 'commence pendant et se termine après', bref: 'chevauché' },
  [COMMENCE]: { libelle: 'commence en même temps que, et finit avant', bref: 'commence' },
  [COMMENCE_PAR]: { libelle: 'commence en même temps que, et finit après', bref: 'commencé par' },
  [PENDANT]: { libelle: 'est strictement contenu dans', bref: 'pendant' },
  [CONTIENT]: { libelle: 'contient strictement', bref: 'contient' },
  [FINIT]: { libelle: 'finit en même temps que, et commence après', bref: 'finit' },
  [FINIT_PAR]: { libelle: 'finit en même temps que, et commence avant', bref: 'fini par' },
  [EGALE]: { libelle: 'coïncide avec', bref: 'égale' },
};

/**
 * Le classifieur : la relation d'Allen qui tient de `a` vers `b`.
 *
 * Les treize cas sont exhaustifs et mutuellement exclusifs sur des intervalles
 * non dégénérés — c'est le théorème qui fonde l'algèbre, et l'ordre des tests
 * ci-dessous en est la lecture directe.
 */
function classer(a: Segment, b: Segment): string {
  if (a.fin < b.debut) return AVANT;
  if (b.fin < a.debut) return APRES;
  if (a.fin === b.debut) return RENCONTRE;
  if (b.fin === a.debut) return RENCONTRE_PAR;
  if (a.debut === b.debut && a.fin === b.fin) return EGALE;
  if (a.debut === b.debut) return a.fin < b.fin ? COMMENCE : COMMENCE_PAR;
  if (a.fin === b.fin) return a.debut > b.debut ? FINIT : FINIT_PAR;
  if (a.debut > b.debut && a.fin < b.fin) return PENDANT;
  if (a.debut < b.debut && a.fin > b.fin) return CONTIENT;
  return a.debut < b.debut ? CHEVAUCHE : CHEVAUCHE_PAR;
}

const table = deriverTable(classer);

function relationDansModele(modele: Modele, a: string, b: string): string {
  const segments = modele.segments ?? {};
  const sa = segments[a];
  const sb = segments[b];
  if (!sa || !sb) return EGALE;
  return classer(sa, sb);
}

export const allen: Systeme = {
  id: 'allen',
  nom: 'Intervalles',
  resume: 'Des intervalles de temps, et les treize façons dont deux d’entre eux peuvent se situer.',
  regimes: ['algebre'],
  relations: Object.keys(LIBELLES).map((id) => ({ id, ...LIBELLES[id] })),
  monde: 'ouvert',
  converse: (relation) => CONVERSES[relation] ?? relation,
  composer: (r, s) => new Set(table.composition[r]?.[s] ?? Object.keys(LIBELLES)),
  // Voir l'en-tête : propager ne suffit pas, il faut exhiber un scénario.
  cheminComplet: false,
  relationDansModele,

  engendrer(difficulte: number, alea: Alea): Instance {
    const nombre = Math.min(NOMS.length, 3 + Math.floor(difficulte / 3));
    const entites = NOMS.slice(0, nombre);
    const tires = tirerSegments(nombre, (borne) => alea.entier(borne));
    const segments: Record<string, Segment> = {};
    entites.forEach((entite, i) => {
      segments[entite] = tires[i] ?? { debut: i, fin: i + 2 };
    });
    const modele: Modele = { segments };

    // Une chaîne de faits, comme partout : elle relie toutes les entités sans
    // tout révéler, ce qui laisse de l'indétermination aux moteurs qui en vivent.
    const ordre = alea.melanger(entites);
    const faits = ordre.slice(1).map((entite, i) => ({
      sujet: entite,
      relation: relationDansModele(modele, entite, ordre[i]),
      objet: ordre[i],
    }));

    return { systeme: 'allen', entites, faits: alea.melanger(faits), modele };
  },

  rendu: 'texte',
};
