/**
 * Estimation continue du niveau, et zone proximale de développement.
 *
 * La zone proximale (Vygotski) est l'écart entre ce qu'on sait faire seul et ce
 * qu'on peut faire avec un contenu bien calibré : ni déjà acquis, ni hors de
 * portée. Tout l'enjeu est de savoir, à chaque instant, où elle se trouve pour
 * chaque sujet — sans demander à la personne de s'auto-évaluer en permanence.
 *
 * **Pourquoi une notation de type Elo.** On pourrait se contenter d'une moyenne
 * mobile du taux de réussite, croisée avec une difficulté déclarée sur chaque
 * fiche. Mais cette difficulté déclarée n'existe pas ici, et l'inventer fiche
 * par fiche serait à la fois long et arbitraire. Elo résout les deux problèmes
 * d'un coup : la difficulté de chaque item **s'estime elle-même**, comme le
 * classement d'un joueur, et la zone proximale s'en déduit sans réglage
 * supplémentaire — ce sont les items dont la réussite est prédite ni quasi
 * certaine ni quasi nulle. Un taux de réussite brut, lui, ne dit rien : 80 % sur
 * des questions faciles et 80 % sur des questions dures ne décrivent pas le même
 * niveau, et c'est précisément ce que la note de l'adversaire apporte.
 *
 * **Trois granularités à chaque réponse.** Une réponse met à jour la fiche, le
 * fascicule et la matière. Un niveau global masquerait une faiblesse localisée
 * sur un seul fascicule — et c'est justement ce qu'on cherche à voir.
 *
 * **Jamais figé.** Il n'y a pas de phase de calibration qui se clôt : le premier
 * échange est un échange comme un autre, simplement plus informatif parce que le
 * pas d'ajustement est plus grand tant que les observations sont rares.
 */
import {
  ecrireCompetence,
  ecrireDifficulte,
  lireCompetence,
  lireDifficultes,
  toutesLesCompetences,
  type Competence,
  type DifficulteItem,
} from './db';
import { db } from './db';
import { estMethodologique, MATIERE_CAS_PRATIQUE } from './contenu-ecarte';

/** Note de départ, pour une personne comme pour un item. */
export const NOTE_INITIALE = 1200;

/**
 * En dessous de ce nombre d'observations, aucune note n'est affichée.
 *
 * Montrer « 1187 » après deux réponses serait donner à du bruit l'allure d'une
 * mesure. Le cahier des charges le demande explicitement, et il a raison.
 */
export const OBSERVATIONS_MINIMALES = 5;

/**
 * Pas d'ajustement, décroissant avec l'expérience.
 *
 * Grand au début pour converger vite depuis une note arbitraire, petit ensuite
 * pour qu'une mauvaise journée ne défasse pas trois mois d'observations.
 */
function pas(observations: number, item = false): number {
  const base = observations < 10 ? 32 : observations < 30 ? 24 : 16;
  // La difficulté d'un item bouge plus lentement : il est vu bien plus rarement
  // que la personne ne répond, et chaque réponse pèserait donc trop lourd.
  return item ? base / 2 : base;
}

/**
 * Nouvelle note de la personne après une confrontation. Fonction pure.
 *
 * Extraite pour être éprouvée seule : la suite d'essais simule des apprenants
 * de niveau connu et vérifie que l'estimation converge vers eux. Une formule
 * d'ajustement qui dérive ne se voit pas à l'usage — elle donne simplement, au
 * bout de quelques semaines, des exercices mal calibrés sans qu'on sache
 * pourquoi.
 */
export function ajusterNiveau(
  note: number,
  observations: number,
  difficulte: number,
  resultat: number,
): number {
  return note + pas(observations) * (resultat - chanceDeReussite(note, difficulte));
}

/** Nouvelle difficulté de l'item. Le signe s'inverse : ce qu'on réussit baisse. */
export function ajusterDifficulte(
  difficulte: number,
  observations: number,
  niveau: number,
  resultat: number,
): number {
  return difficulte - pas(observations, true) * (resultat - chanceDeReussite(niveau, difficulte));
}

/** Probabilité de réussite prédite par l'écart de notes. */
export function chanceDeReussite(niveau: number, difficulte: number): number {
  return 1 / (1 + 10 ** ((difficulte - niveau) / 400));
}

/**
 * La cible : une réussite prédite à 70 %.
 *
 * C'est l'ordre de grandeur que visent les procédures adaptatives — assez de
 * réussite pour que l'exercice reste praticable, assez d'échec pour qu'il
 * apprenne quelque chose. On en déduit la difficulté visée par l'inverse de la
 * formule ci-dessus.
 */
export const REUSSITE_VISEE = 0.7;

export function difficulteVisee(niveau: number): number {
  return niveau - 400 * Math.log10(REUSSITE_VISEE / (1 - REUSSITE_VISEE));
}

/** Les sources d'interactions qui alimentent — ou non — l'estimation. */
export interface ReglagesNiveau {
  quiz: boolean;
  flashcards: boolean;
  /** Flashcards et QCM servis par un rappel de séance. */
  rappels: boolean;
  /**
   * QCM-DGFiP. Exclu par défaut : ses rubriques — Français, Culture générale,
   * Logique, Maths — ne recouvrent pas les matières du concours, et les y mêler
   * fausserait des niveaux qu'elles ne mesurent pas.
   */
  dgfip: boolean;
}

export const REGLAGES_NIVEAU_PAR_DEFAUT: ReglagesNiveau = {
  quiz: true,
  flashcards: true,
  rappels: true,
  dgfip: false,
};

export type Source = keyof ReglagesNiveau;

/**
 * Ce que l'estimation refuse de prendre pour une mesure de connaissance.
 *
 * Les deux exclusions sont de même nature : ce sont des contenus dont la
 * réussite ne dit pas ce qu'on sait d'une matière.
 *
 * — **La résolution de cas pratique** n'est pas une matière de connaissances :
 *   elle s'évalue sur une note rédigée, pas sur des questions fermées. Les
 *   quelques flashcards et quiz de ses fiches portent sur du vocabulaire de
 *   management ; les compter donnerait un « niveau en RCP » qui ne prédirait
 *   rien de la copie.
 * — **Les fiches de méthodologie** décrivent le déroulé d'une épreuve. Savoir
 *   qu'une note fait huit pages est un fait vrai et parfaitement inutile pour
 *   situer le niveau en économie.
 *
 * Les deux restent désactivables : ce sont des réglages, pas des interdits.
 */
export interface ReglagesContenu {
  /** Les fiches de la matière « Cas pratique » alimentent-elles l'estimation ? */
  casPratique: boolean;
  /** Les fiches de méthodologie l'alimentent-elles ? */
  methodologie: boolean;
  /** Les fiches de méthodologie entrent-elles dans les files de révision ? */
  reviserMethodologie: boolean;
}

export const REGLAGES_CONTENU_PAR_DEFAUT: ReglagesContenu = {
  casPratique: false,
  methodologie: false,
  reviserMethodologie: false,
};

export async function lireReglagesContenu(): Promise<ReglagesContenu> {
  const stockes = (await (await db()).get('etat', 'reglagesContenu')) as
    | Partial<ReglagesContenu>
    | undefined;
  return { ...REGLAGES_CONTENU_PAR_DEFAUT, ...(stockes ?? {}) };
}

export async function ecrireReglagesContenu(reglages: ReglagesContenu) {
  await (await db()).put('etat', reglages, 'reglagesContenu');
}

export async function lireReglagesNiveau(): Promise<ReglagesNiveau> {
  const stockes = (await (await db()).get('etat', 'reglagesNiveau')) as
    | Partial<ReglagesNiveau>
    | undefined;
  return { ...REGLAGES_NIVEAU_PAR_DEFAUT, ...(stockes ?? {}) };
}

export async function ecrireReglagesNiveau(reglages: ReglagesNiveau) {
  await (await db()).put('etat', reglages, 'reglagesNiveau');
}

/** Les trois clés de sujet touchées par une réponse. */
export function clefs(sujet: {
  matiere: string;
  fascicule?: string;
  ficheId?: string;
  ficheTitre?: string;
}): { clef: string; portee: Competence['portee']; libelle: string }[] {
  const liste: { clef: string; portee: Competence['portee']; libelle: string }[] = [
    { clef: `matiere:${sujet.matiere}`, portee: 'matiere', libelle: sujet.matiere },
  ];
  if (sujet.fascicule) {
    liste.push({
      clef: `fascicule:${sujet.matiere}|${sujet.fascicule}`,
      portee: 'fascicule',
      libelle: sujet.fascicule,
    });
  }
  if (sujet.ficheId) {
    liste.push({
      clef: `fiche:${sujet.ficheId}`,
      portee: 'fiche',
      libelle: sujet.ficheTitre ?? sujet.ficheId,
    });
  }
  return liste;
}

async function competenceOuNeuve(
  clef: string,
  portee: Competence['portee'],
  libelle: string,
  matiere: string,
): Promise<Competence> {
  return (
    (await lireCompetence(clef)) ?? {
      clef,
      portee,
      libelle,
      matiere,
      note: NOTE_INITIALE,
      observations: 0,
      majLe: new Date().toISOString(),
    }
  );
}

/**
 * Amorces d'auto-estimation, proposées à la première entrée dans une matière.
 *
 * L'écart entre deux crans vaut 150 points, soit environ 30 points de
 * probabilité de réussite face au même item : assez pour que le choix change le
 * contenu proposé, pas assez pour qu'un mauvais choix enferme qui que ce soit.
 */
export const AMORCES: { id: string; libelle: string; note: number }[] = [
  { id: 'debutant', libelle: 'Je découvre', note: NOTE_INITIALE - 150 },
  { id: 'intermediaire', libelle: 'J’ai des bases', note: NOTE_INITIALE },
  { id: 'alaise', libelle: 'Je suis à l’aise', note: NOTE_INITIALE + 150 },
];

/**
 * Enregistre une auto-estimation de départ pour une matière.
 *
 * Elle ne vaut que comme amorce : `observations` reste à zéro, aucun chiffre
 * n'est affiché, et la première réponse réelle la déplace comme n'importe
 * quelle autre note. Refuser de calibrer ne coûte rien — c'est le cas par
 * défaut.
 */
export async function calibrer(matiere: string, note: number, maintenant = new Date()) {
  const clef = `matiere:${matiere}`;
  const existante = await lireCompetence(clef);
  // On ne recalibre pas par-dessus des observations réelles : elles en savent
  // plus que n'importe quelle impression.
  if (existante && existante.observations > 0) return;
  await ecrireCompetence({
    clef,
    portee: 'matiere',
    libelle: matiere,
    matiere,
    note,
    observations: 0,
    calibree: true,
    majLe: maintenant.toISOString(),
  });
}

/** Une note est-elle exploitable — par observation, ou par amorce ? */
export function utilisable(c: Pick<Competence, 'observations' | 'calibree'>): boolean {
  return Boolean(c.calibree) || c.observations >= OBSERVATIONS_MINIMALES;
}

export interface Reponse {
  /** L'item auquel on vient de répondre. */
  itemId: string;
  /** 1 pour juste, 0 pour faux ; les valeurs intermédiaires sont admises. */
  resultat: number;
  matiere: string;
  fascicule?: string;
  ficheId?: string;
  ficheTitre?: string;
  source: Source;
}

/**
 * Enregistre une réponse notée et met à jour les estimations.
 *
 * Ne fait rien si la source est désactivée dans les réglages. Le réglage n'a
 * aucun effet rétroactif : il cesse d'alimenter, il n'efface pas.
 */
export async function enregistrerReponse(reponse: Reponse, maintenant = new Date()): Promise<void> {
  const reglages = await lireReglagesNiveau();
  if (!reglages[reponse.source]) return;
  if (!(await compteDansLeNiveau(reponse))) return;

  const quand = maintenant.toISOString();
  const difficultes = await lireDifficultes([reponse.itemId]);
  const item: DifficulteItem = difficultes.get(reponse.itemId) ?? {
    id: reponse.itemId,
    note: NOTE_INITIALE,
    observations: 0,
    majLe: quand,
  };

  const sujets = clefs(reponse);
  const competences = await Promise.all(
    sujets.map((s) => competenceOuNeuve(s.clef, s.portee, s.libelle, reponse.matiere)),
  );

  // La difficulté de l'item se confronte au niveau le plus **spécifique**
  // disponible : c'est celui qui décrit le mieux la personne sur ce point précis.
  const specifique = competences[competences.length - 1];

  for (const competence of competences) {
    await ecrireCompetence({
      ...competence,
      // Le libellé peut avoir changé (fiche renommée) : on garde le plus récent.
      libelle: sujets.find((s) => s.clef === competence.clef)?.libelle ?? competence.libelle,
      note: ajusterNiveau(competence.note, competence.observations, item.note, reponse.resultat),
      observations: competence.observations + 1,
      // Une observation réelle l'emporte sur l'amorce, et l'efface comme telle.
      calibree: false,
      majLe: quand,
    });
  }

  await ecrireDifficulte({
    ...item,
    note: ajusterDifficulte(item.note, item.observations, specifique.note, reponse.resultat),
    observations: item.observations + 1,
    majLe: quand,
  });
}

/**
 * La réponse porte-t-elle sur un contenu que l'estimation accepte de mesurer ?
 *
 * Le manifeste est en cache : cette vérification ne déchiffre rien et ne coûte
 * rien d'autre qu'une recherche en mémoire.
 */
export async function compteDansLeNiveau(
  reponse: Pick<Reponse, 'matiere' | 'ficheId'>,
): Promise<boolean> {
  const reglages = await lireReglagesContenu();
  if (!reglages.casPratique && reponse.matiere === MATIERE_CAS_PRATIQUE) return false;
  if (reglages.methodologie || !reponse.ficheId) return true;
  // Import différé : le manifeste vit dans la couche de contenu chiffré, que ce
  // module n'a aucune raison de tirer tant qu'aucune réponse n'est enregistrée.
  const { aplatirFiches, chargerManifeste } = await import('./contenu');
  const fiche = aplatirFiches(await chargerManifeste()).find((f) => f.id === reponse.ficheId);
  return !fiche || !estMethodologique(fiche);
}

export interface NiveauAffiche {
  clef: string;
  libelle: string;
  matiere: string;
  portee: Competence['portee'];
  note: number;
  observations: number;
  /** Faux tant que les observations sont trop rares pour afficher un chiffre. */
  fiable: boolean;
  /** La note ne vient encore que d'une auto-estimation. */
  calibree: boolean;
  majLe: string;
}

function afficher(c: Competence): NiveauAffiche {
  return {
    clef: c.clef,
    libelle: c.libelle,
    matiere: c.matiere,
    portee: c.portee,
    note: Math.round(c.note),
    observations: c.observations,
    fiable: c.observations >= OBSERVATIONS_MINIMALES,
    calibree: Boolean(c.calibree) && c.observations === 0,
    majLe: c.majLe,
  };
}

/** Le tableau de bord : une matière, et ses fascicules sur demande. */
export async function tableauDeNiveaux(): Promise<
  { matiere: NiveauAffiche; fascicules: NiveauAffiche[] }[]
> {
  const toutes = await toutesLesCompetences();
  const matieres = toutes.filter((c) => c.portee === 'matiere').map(afficher);
  return matieres
    .map((matiere) => ({
      matiere,
      fascicules: toutes
        .filter((c) => c.portee === 'fascicule' && c.matiere === matiere.matiere)
        .map(afficher)
        .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr', { numeric: true })),
    }))
    .sort((a, b) => a.matiere.libelle.localeCompare(b.matiere.libelle, 'fr'));
}

/**
 * Le sujet le plus utile à travailler maintenant.
 *
 * Non pas le plus faible dans l'absolu — un fascicule jamais ouvert n'est pas
 * une faiblesse, c'est une absence —, mais celui dont la note est la plus basse
 * parmi ceux qu'on connaît assez pour l'affirmer.
 */
export async function zoneDeTravail(): Promise<NiveauAffiche | null> {
  const fiables = (await toutesLesCompetences())
    .filter((c) => c.portee === 'fascicule' && c.observations >= OBSERVATIONS_MINIMALES)
    .map(afficher);
  if (!fiables.length) return null;
  return fiables.reduce((bas, c) => (c.note < bas.note ? c : bas));
}

/**
 * Ordonne des candidats par proximité avec la zone proximale du sujet.
 *
 * L'appelant fournit la clé de sujet la plus fine dont il dispose ; à défaut de
 * note fiable, l'ordre d'entrée est conservé — mieux vaut un tirage inchangé
 * qu'un tri fondé sur une estimation que l'on sait creuse.
 */
export async function ordonnerParZoneProximale<T extends { id: string }>(
  candidats: readonly T[],
  clefSujet: string,
): Promise<T[]> {
  const competence = await lireCompetence(clefSujet);
  if (!competence || !utilisable(competence)) return [...candidats];

  const difficultes = await lireDifficultes(candidats.map((c) => c.id));
  const cible = difficulteVisee(competence.note);
  return [...candidats].sort((a, b) => {
    // Un item jamais vu est supposé de difficulté moyenne ; son écart à la cible
    // est donc celui de la note initiale, ce qui le place naturellement parmi
    // les candidats plausibles sans jamais le privilégier.
    const da = difficultes.get(a.id)?.note ?? NOTE_INITIALE;
    const dbb = difficultes.get(b.id)?.note ?? NOTE_INITIALE;
    return Math.abs(da - cible) - Math.abs(dbb - cible);
  });
}
