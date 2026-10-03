/**
 * Répétition espacée — FSRS (Free Spaced Repetition Scheduler).
 *
 * FSRS modélise la mémoire par trois grandeurs ajustées sur des données réelles
 * — la **difficulté** d'une carte, la **stabilité** de sa trace, et la
 * **récupérabilité** qui décroît avec le temps écoulé —, là où SM-2, qui tenait
 * cette place jusqu'ici, appliquait une formule fixe au facteur de facilité.
 * L'ordonnanceur vient de `ts-fsrs`, l'implémentation de référence : réécrire
 * l'algorithme à la main aurait été refaire un travail d'ajustement statistique
 * dont nous n'avons pas les données.
 *
 * **Les paramètres sont ceux par défaut, à une exception documentée.** Les
 * optimiser demande plusieurs centaines de révisions réelles ; ce sera une
 * amélioration ultérieure, pas un prérequis. L'exception est
 * `enable_short_term`, désactivé : il fait programmer des reprises à dix minutes
 * dans la même journée, alors que tout l'ordonnancement du site est au jour
 * — `du` est une date `AAAA-MM-JJ`, l'index l'est aussi, et les écrans comptent
 * « les cartes dues aujourd'hui ». Stocker un état dont on jette la précision
 * aurait fait diverger le modèle et sa représentation ; mieux vaut que
 * l'ordonnanceur travaille dans l'unité que la base sait conserver.
 *
 * **La notation passe de trois à quatre niveaux**, et ce n'est pas un ajout
 * cosmétique : voir `Note` dans `db.ts`.
 */
import { fsrs, generatorParameters, Rating, type Grade } from 'ts-fsrs';
import {
  ecrireCarte,
  fsrsNeuf,
  jourISO,
  lireCarte,
  serialiserFsrs,
  type EtatCarte,
  type Note,
} from './db';

const ordonnanceur = fsrs(generatorParameters({ enable_short_term: false }));

/** Les quatre notes, dans l'ordre où l'interface les présente. */
export const NOTES: readonly Note[] = ['oublie', 'difficile', 'correct', 'facile'];

export const LIBELLES: Record<Note, string> = {
  oublie: 'Oublié',
  difficile: 'Difficile',
  correct: 'Correct',
  facile: 'Facile',
};

/** Correspondance avec les grades de la bibliothèque. */
const GRADE: Record<Note, Grade> = {
  oublie: Rating.Again,
  difficile: Rating.Hard,
  correct: Rating.Good,
  facile: Rating.Easy,
};

export function carteNeuve(
  id: string,
  ficheId: string,
  matiere: string,
  maintenant = new Date(),
): EtatCarte {
  const fsrsCarte = fsrsNeuf(maintenant);
  return {
    id,
    ficheId,
    matiere,
    du: jourISO(new Date(fsrsCarte.due)),
    derniereRevision: null,
    intervalle: 0,
    revisions: 0,
    oublis: 0,
    fsrs: fsrsCarte,
  };
}

/** Applique une note à une carte et retourne son nouvel état (calcul pur). */
export function noter(carte: EtatCarte, note: Note, maintenant = new Date()): EtatCarte {
  const { card } = ordonnanceur.next(carte.fsrs, maintenant, GRADE[note]);
  return {
    ...carte,
    du: jourISO(card.due),
    intervalle: card.scheduled_days,
    revisions: carte.revisions + 1,
    // Notre compteur, et non `card.lapses` : celui de la bibliothèque repart de
    // zéro à la migration, alors que ce compte est de l'histoire.
    oublis: carte.oublis + (note === 'oublie' ? 1 : 0),
    derniereRevision: maintenant.toISOString(),
    fsrs: serialiserFsrs(card),
  };
}

/**
 * Les échéances que produirait chacun des quatre boutons.
 *
 * L'interface les affiche sous les boutons : savoir qu'un « Correct » renvoie la
 * carte à trois semaines et un « Difficile » à quatre jours fait partie de la
 * décision. La bibliothèque calcule les quatre en une passe.
 */
export function apercu(carte: EtatCarte, maintenant = new Date()): Record<Note, Date> {
  const previsions = ordonnanceur.repeat(carte.fsrs, maintenant);
  const resultat = {} as Record<Note, Date>;
  for (const note of NOTES) resultat[note] = previsions[GRADE[note]].card.due;
  return resultat;
}

/** « aujourd'hui », « demain », « dans 3 j », « dans 5 mois ». */
export function delai(echeance: Date, maintenant = new Date()): string {
  const jours = Math.round(
    (new Date(jourISO(echeance)).getTime() - new Date(jourISO(maintenant)).getTime()) / 86_400_000,
  );
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'demain';
  if (jours < 31) return `dans ${jours} j`;
  if (jours < 365) return `dans ${Math.round(jours / 30)} mois`;
  const ans = jours / 365;
  return `dans ${ans < 2 ? '1 an' : `${Math.round(ans)} ans`}`;
}

/** Note une carte et enregistre le résultat. */
export async function noterEtEnregistrer(
  id: string,
  ficheId: string,
  matiere: string,
  note: Note,
): Promise<EtatCarte> {
  const existante = (await lireCarte(id)) ?? carteNeuve(id, ficheId, matiere);
  const misAJour = noter({ ...existante, ficheId, matiere }, note);
  await ecrireCarte(misAJour);
  return misAJour;
}

/** Une carte est due si elle n'a jamais été vue ou si son échéance est atteinte. */
export function estDue(carte: EtatCarte | undefined, aujourdhui = jourISO()): boolean {
  if (!carte) return true;
  return carte.du <= aujourdhui;
}

/** Niveau de maîtrise d'une carte, de 0 à 1 : sert aux barres de progression. */
export function maitrise(carte: EtatCarte | undefined): number {
  if (!carte || carte.revisions === 0) return 0;
  // 21 jours d'intervalle = carte considérée comme acquise. La convention est
  // celle d'avant FSRS, et elle se transpose : l'intervalle programmé croît avec
  // la stabilité de la trace.
  return Math.min(1, carte.intervalle / 21);
}
