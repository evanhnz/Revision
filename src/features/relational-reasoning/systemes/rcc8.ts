/**
 * Système `rcc8` : huit relations de connexion entre régions.
 *
 * C'est l'algèbre RCC8 du *Region Connection Calculus* : deux régions sont
 * disjointes, se touchent, se recouvrent partiellement, l'une est partie de
 * l'autre — en contact ou non avec son bord —, ou les deux coïncident.
 *
 * **Les régions sont ici des segments d'une droite graduée.** Ce n'est pas une
 * approximation commode mais une décision assumée : la table de composition est
 * dérivée du modèle par énumération exhaustive plutôt que recopiée, et elle est
 * donc exacte **pour ce modèle**. Sur des régions quelconques du plan, certaines
 * compositions seraient plus larges — deux taches peuvent se toucher de façons
 * qu'un segment ne permet pas. L'énoncé affiche des segments, la réponse porte
 * sur des segments, et l'intitulé du système le dit.
 *
 * **Le rapport avec `allen`.** Les deux systèmes partagent le même modèle et le
 * même classifieur d'intervalles ; RCC8 en est la version **grossière**, qui
 * regroupe les treize relations d'Allen en huit. C'est un exemple exact de ce que
 * la séparation en deux couches devait rendre possible : deux systèmes, deux
 * vocabulaires, un seul modèle, et aucun moteur à modifier. Et c'est un exercice
 * en soi que de voir qu'une algèbre plus grossière n'est pas une algèbre plus
 * simple — regrouper des relations **affaiblit** la composition, donc **augmente**
 * l'indétermination.
 *
 * La cohérence de chemin y est **incomplète**, comme pour `allen`.
 */
import { deriverTable, tirerSegments, type Segment } from '../noyaux/intervalles';
import type { Alea, Instance, Modele, Systeme } from './types';

const NOMS = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'];

const DC = 'dc';
const EC = 'ec';
const PO = 'po';
const TPP = 'tpp';
const NTPP = 'ntpp';
const TPPI = 'tppi';
const NTPPI = 'ntppi';
const EQ = 'eq';

const CONVERSES: Record<string, string> = {
  [DC]: DC,
  [EC]: EC,
  [PO]: PO,
  [TPP]: TPPI,
  [TPPI]: TPP,
  [NTPP]: NTPPI,
  [NTPPI]: NTPP,
  [EQ]: EQ,
};

const LIBELLES: Record<string, { libelle: string; bref: string }> = {
  [DC]: { libelle: 'est séparée de', bref: 'séparée' },
  [EC]: { libelle: 'touche le bord de', bref: 'touche' },
  [PO]: { libelle: 'recouvre partiellement', bref: 'recouvre' },
  [TPP]: { libelle: 'est incluse dans, en touchant son bord,', bref: 'incluse au bord' },
  [NTPP]: { libelle: 'est incluse à l’intérieur de', bref: 'incluse' },
  [TPPI]: { libelle: 'contient, en touchant son bord,', bref: 'contient au bord' },
  [NTPPI]: { libelle: 'contient à l’intérieur', bref: 'contient' },
  [EQ]: { libelle: 'coïncide avec', bref: 'coïncide' },
};

/**
 * Le classifieur RCC8 sur des segments.
 *
 * L'ordre des tests suit la définition : on écarte d'abord la disjonction et le
 * contact, puis l'égalité, puis l'inclusion — en distinguant selon qu'elle
 * touche un bord —, et le reste est un recouvrement partiel.
 */
function classer(a: Segment, b: Segment): string {
  if (a.fin < b.debut || b.fin < a.debut) return DC;
  if (a.fin === b.debut || b.fin === a.debut) return EC;
  if (a.debut === b.debut && a.fin === b.fin) return EQ;

  const aDansB = a.debut >= b.debut && a.fin <= b.fin;
  const bDansA = b.debut >= a.debut && b.fin <= a.fin;
  if (aDansB) return a.debut === b.debut || a.fin === b.fin ? TPP : NTPP;
  if (bDansA) return a.debut === b.debut || a.fin === b.fin ? TPPI : NTPPI;
  return PO;
}

const table = deriverTable(classer);

function relationDansModele(modele: Modele, a: string, b: string): string {
  const segments = modele.segments ?? {};
  const sa = segments[a];
  const sb = segments[b];
  if (!sa || !sb) return EQ;
  return classer(sa, sb);
}

export const rcc8: Systeme = {
  id: 'rcc8',
  nom: 'Régions',
  resume:
    'Des zones sur une droite graduée, et les huit façons dont deux d’entre elles peuvent ' +
    'se connecter : séparées, en contact, recouvrantes, incluses, confondues.',
  regimes: ['algebre'],
  relations: Object.keys(LIBELLES).map((id) => ({ id, ...LIBELLES[id] })),
  monde: 'ouvert',
  converse: (relation) => CONVERSES[relation] ?? relation,
  composer: (r, s) => new Set(table.composition[r]?.[s] ?? Object.keys(LIBELLES)),
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

    const ordre = alea.melanger(entites);
    const faits = ordre.slice(1).map((entite, i) => ({
      sujet: entite,
      relation: relationDansModele(modele, entite, ordre[i]),
      objet: ordre[i],
    }));

    return { systeme: 'rcc8', entites, faits: alea.melanger(faits), modele };
  },

  rendu: 'texte',
};
