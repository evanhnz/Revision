/**
 * Journal d'erreurs — une file de révision séparée pour les vrais oublis.
 *
 * Toute réponse fausse en quiz, toute réponse fausse au QCM-DGFiP et tout
 * « oublié » sur une flashcard ouvrent une entrée ici. Cette file **s'ajoute**
 * au passage normalement programmé de l'item : FSRS continue de faire son
 * travail, le journal ne le remplace pas. Les deux mécanismes répondent à des
 * questions différentes — « quand faut-il revoir cette carte ? » pour l'un,
 * « qu'est-ce qui n'est pas passé ? » pour l'autre.
 *
 * **La règle de sortie est le cœur du dispositif.** Une entrée ne se referme
 * qu'après deux réussites lors de **sessions distinctes** du journal. Une seule
 * réussite peut être un coup de chance, ou le souvenir tout frais de la
 * correction qu'on vient de lire ; refermer là-dessus effacerait justement le
 * signal qu'on voulait garder. Et une nouvelle erreur remet le compteur à zéro,
 * pour la même raison.
 *
 * **Le prétest n'alimente pas le journal**, délibérément : s'y tromper est
 * attendu, ce n'est pas un oubli à rattraper. Aucun appel ne vient de là.
 *
 * L'injection automatique dans la séance suivante de la matière est le
 * mécanisme principal de reprise — la page dédiée n'est qu'une vue d'ensemble.
 * Rien ne doit dépendre du fait que la personne pense à aller la consulter.
 */
import {
  ecrireEntreeJournal,
  lireEntreeJournal,
  toutesLesEntreesJournal,
  type EntreeJournal,
} from './db';

export type { EntreeJournal };

/**
 * La banque DGFiP ne relève d'aucune matière du concours — ses rubriques sont
 * Français, Culture générale, Logique et Maths. Elle est donc sa propre
 * « matière » dans le journal, ce qui évite de répartir ses erreurs dans des
 * matières auxquelles elles n'appartiennent pas.
 */
export const MATIERE_DGFIP = 'QCM DGFiP';

/** Réussites nécessaires, dans des sessions distinctes, pour refermer. */
export const REUSSITES_POUR_FERMER = 2;

export interface Fautif {
  id: string;
  genre: EntreeJournal['genre'];
  matiere: string;
  fascicule?: string;
  ficheId?: string;
  rubriqueId?: string;
}

/**
 * Enregistre une erreur : ouvre l'entrée, ou la rouvre et remet son compteur de
 * réussites à zéro.
 */
export async function signalerErreur(fautif: Fautif, maintenant = new Date()): Promise<void> {
  const quand = maintenant.toISOString();
  const existante = await lireEntreeJournal(fautif.id);
  const { fermeeLe: _refermee, ...ancienne } = existante ?? ({} as EntreeJournal);
  await ecrireEntreeJournal({
    ...ancienne,
    id: fautif.id,
    genre: fautif.genre,
    matiere: fautif.matiere,
    ...(fautif.fascicule ? { fascicule: fautif.fascicule } : {}),
    ...(fautif.ficheId ? { ficheId: fautif.ficheId } : {}),
    ...(fautif.rubriqueId ? { rubriqueId: fautif.rubriqueId } : {}),
    ouverteLe: existante?.ouverteLe ?? quand,
    derniereErreurLe: quand,
    erreurs: (existante?.erreurs ?? 0) + 1,
    reussites: 0,
    derniereSession: null,
  });
}

/**
 * Enregistre une réussite obtenue **pendant une session de journal**.
 *
 * `session` identifie la session en cours : une réussite de plus dans la même
 * session ne compte pas, puisque la règle demande des reprises séparées.
 * Retourne l'entrée mise à jour, ou `null` si elle n'existait pas.
 */
export async function signalerReussite(
  id: string,
  session: string,
  maintenant = new Date(),
): Promise<EntreeJournal | null> {
  const entree = await lireEntreeJournal(id);
  if (!entree || entree.fermeeLe) return null;
  if (entree.derniereSession === session) return entree;
  const reussites = entree.reussites + 1;
  const misAJour: EntreeJournal = {
    ...entree,
    reussites,
    derniereSession: session,
    ...(reussites >= REUSSITES_POUR_FERMER ? { fermeeLe: maintenant.toISOString() } : {}),
  };
  await ecrireEntreeJournal(misAJour);
  return misAJour;
}

/** Identifiant d'une session de journal — il ne sert qu'à les distinguer. */
export function nouvelleSession(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function entreesOuvertes(): Promise<EntreeJournal[]> {
  return (await toutesLesEntreesJournal()).filter((e) => !e.fermeeLe);
}

/** Combien d'entrées ouvertes, par matière puis par fascicule. */
export async function comptesParMatiere(): Promise<
  { matiere: string; total: number; fascicules: { nom: string; total: number }[] }[]
> {
  const ouvertes = await entreesOuvertes();
  const parMatiere = new Map<string, Map<string, number>>();
  for (const entree of ouvertes) {
    const fascicules = parMatiere.get(entree.matiere) ?? new Map<string, number>();
    const nom = entree.fascicule ?? '—';
    fascicules.set(nom, (fascicules.get(nom) ?? 0) + 1);
    parMatiere.set(entree.matiere, fascicules);
  }
  return [...parMatiere.entries()]
    .map(([matiere, fascicules]) => ({
      matiere,
      total: [...fascicules.values()].reduce((a, b) => a + b, 0),
      fascicules: [...fascicules.entries()]
        .map(([nom, total]) => ({ nom, total }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Les entrées à servir dans la prochaine séance d'une matière.
 *
 * L'ordre suit ce que demande la méthode : d'abord celles **nées de la séance
 * qui vient de se terminer** — c'est-à-dire depuis `depuis` —, puis les plus
 * anciennes encore ouvertes, parce qu'une entrée qui traîne depuis six semaines
 * est justement celle qu'on n'a jamais reprise.
 */
export async function pourLaSeance(
  matieres: readonly string[],
  depuis: string | null,
  limite: number,
): Promise<EntreeJournal[]> {
  // Un thème de planification peut couvrir plusieurs matières du contenu : la
  // séance vient donc chercher les entrées de toutes les siennes.
  const visees = new Set(matieres);
  const ouvertes = (await entreesOuvertes()).filter((e) => visees.has(e.matiere));
  const recentes = depuis ? ouvertes.filter((e) => e.derniereErreurLe >= depuis) : [];
  const idsRecents = new Set(recentes.map((e) => e.id));
  const anciennes = ouvertes.filter((e) => !idsRecents.has(e.id));
  recentes.sort((a, b) => a.derniereErreurLe.localeCompare(b.derniereErreurLe));
  anciennes.sort((a, b) => a.derniereErreurLe.localeCompare(b.derniereErreurLe));
  return [...recentes, ...anciennes].slice(0, limite);
}
