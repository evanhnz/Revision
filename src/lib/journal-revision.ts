/**
 * La session de révision du journal d'erreurs.
 *
 * Le même déroulé sert à deux endroits — la page « Journal d'erreurs » et
 * l'étape obligatoire d'une séance —, et c'est délibéré : dupliquer la règle de
 * sortie serait la condamner à diverger, et c'est elle qui fait tout le travail.
 *
 * Chaque item revient sous sa forme naturelle : un QCM se rejoue comme un QCM,
 * une flashcard se retourne et demande « su ou pas su ». Une flashcard révisée
 * ici **ne touche pas à son échéance FSRS** : le journal est une file qui
 * s'ajoute, pas un second ordonnanceur. Les deux répondent à des questions
 * différentes, et les confondre ferait avancer un calendrier que cette session
 * n'a pas vocation à régler.
 */
import { chargerFiche, type QuestionQuiz } from './contenu';
import {
  nouvelleSession,
  signalerErreur,
  signalerReussite,
  type EntreeJournal,
} from './journal';

export interface ItemJournal {
  entree: EntreeJournal;
  /** L'énoncé, dans les deux cas. */
  question: string;
  /** Présent pour un QCM ; absent pour une flashcard. */
  options?: string[];
  bonnes?: number[];
  /** Présent pour une flashcard. */
  reponse?: string;
  explication?: string;
  /** D'où vient l'item, pour le situer. */
  source: string;
}

/**
 * Charge le contenu des entrées, en n'ouvrant chaque fiche qu'une fois.
 *
 * Une entrée dont l'item a disparu — fiche supprimée, question reformulée donc
 * réidentifiée — est simplement ignorée : mieux vaut une entrée muette qu'une
 * session qui refuse de démarrer.
 */
export async function chargerItems(entrees: readonly EntreeJournal[]): Promise<ItemJournal[]> {
  const items: ItemJournal[] = [];
  const fiches = new Map<string, Awaited<ReturnType<typeof chargerFiche>> | null>();

  for (const entree of entrees) {
    // Entrées héritées d'une banque de QCM retirée : ignorées.
    if (entree.genre === 'dgfip') continue;

    if (!entree.ficheId) continue;
    if (!fiches.has(entree.ficheId)) {
      fiches.set(entree.ficheId, await chargerFiche(entree.ficheId).catch(() => null));
    }
    const fiche = fiches.get(entree.ficheId);
    if (!fiche) continue;

    if (entree.genre === 'quiz') {
      const question: QuestionQuiz | undefined = fiche.quiz.find((q) => q.id === entree.id);
      if (!question) continue;
      items.push({
        entree,
        question: question.question,
        options: question.options,
        bonnes: question.bonnes,
        explication: question.explication,
        source: fiche.titre,
      });
    } else {
      const carte = fiche.flashcards.find((c) => c.id === entree.id);
      if (!carte) continue;
      items.push({ entree, question: carte.question, reponse: carte.reponse, source: fiche.titre });
    }
  }
  return items;
}

export interface Bilan {
  vus: number;
  reussis: number;
  fermes: number;
}

const BOUTON =
  'min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium transition ' +
  'hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';
const OPTION =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm transition ' +
  'hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';

/**
 * Déroule la session dans `hote` et rend le bilan une fois tous les items vus.
 *
 * `auChangement` est appelé après chaque item, pour que la page qui héberge la
 * session puisse rafraîchir son compteur sans attendre la fin.
 */
export function montrer(
  items: readonly ItemJournal[],
  hote: HTMLElement,
  auChangement?: (bilan: Bilan) => void,
): Promise<Bilan> {
  const session = nouvelleSession();
  const bilan: Bilan = { vus: 0, reussis: 0, fermes: 0 };

  return new Promise<Bilan>((terminer) => {
    let position = 0;

    const panneau = document.createElement('section');
    panneau.className =
      'rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-6 dark:border-amber-900 dark:bg-amber-950/20';
    hote.replaceChildren(panneau);
    hote.classList.remove('hidden');

    async function conclure(item: ItemJournal, juste: boolean) {
      bilan.vus += 1;
      if (juste) {
        bilan.reussis += 1;
        const apres = await signalerReussite(item.entree.id, session);
        if (apres?.fermeeLe) bilan.fermes += 1;
      } else {
        await signalerErreur({
          id: item.entree.id,
          genre: item.entree.genre,
          matiere: item.entree.matiere,
          ...(item.entree.fascicule ? { fascicule: item.entree.fascicule } : {}),
          ...(item.entree.ficheId ? { ficheId: item.entree.ficheId } : {}),
          ...(item.entree.rubriqueId ? { rubriqueId: item.entree.rubriqueId } : {}),
        });
      }
      auChangement?.({ ...bilan });
    }

    function afficher() {
      if (position >= items.length) {
        panneau.replaceChildren();
        const fin = document.createElement('p');
        fin.className = 'text-sm font-medium text-slate-700 dark:text-slate-200';
        fin.textContent =
          `Reprise terminée : ${bilan.reussis} sur ${bilan.vus} retrouvé(s)` +
          (bilan.fermes
            ? `, ${bilan.fermes} entrée(s) refermée(s) — il fallait deux reprises séparées.`
            : '. Une entrée se referme après deux reprises séparées.');
        panneau.appendChild(fin);
        terminer(bilan);
        return;
      }

      const item = items[position];
      panneau.replaceChildren();

      const entete = document.createElement('p');
      entete.className = 'text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400';
      entete.textContent =
        `Reprise ${position + 1} / ${items.length} · ${item.source} · ` +
        `${item.entree.reussites}/2 reprise(s) acquise(s)`;
      const enonce = document.createElement('p');
      enonce.className = 'mt-2 font-medium text-slate-900 dark:text-white';
      enonce.textContent = item.question;
      panneau.append(entete, enonce);

      const zone = document.createElement('div');
      zone.className = 'mt-3 space-y-1.5';
      panneau.appendChild(zone);

      const suite = document.createElement('div');
      suite.className = 'mt-4 flex flex-wrap items-center gap-2';

      if (item.options && item.bonnes) {
        const bonnes = item.bonnes;
        item.options.forEach((texte, i) => {
          const bouton = document.createElement('button');
          bouton.type = 'button';
          bouton.className = OPTION;
          bouton.textContent = texte;
          bouton.addEventListener('click', () => {
            const juste = bonnes.includes(i);
            for (const [j, enfant] of [...zone.children].entries()) {
              const b = enfant as HTMLButtonElement;
              b.disabled = true;
              b.className =
                'w-full rounded-lg border px-3 py-2 text-left text-sm ' +
                (bonnes.includes(j)
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : j === i
                    ? 'border-red-400 bg-red-50 text-red-900 line-through dark:border-red-700 dark:bg-red-950/50 dark:text-red-200'
                    : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400');
            }
            if (item.explication) {
              const note = document.createElement('p');
              note.className = 'mt-3 text-sm text-slate-600 dark:text-slate-300';
              note.textContent = item.explication;
              panneau.insertBefore(note, suite);
            }
            void conclure(item, juste).then(() => {
              const suivant = document.createElement('button');
              suivant.type = 'button';
              suivant.className = BOUTON;
              suivant.textContent = position + 1 < items.length ? 'Suivante' : 'Terminer';
              suivant.addEventListener('click', () => {
                position += 1;
                afficher();
              });
              suite.replaceChildren(suivant);
            });
          });
          zone.appendChild(bouton);
        });
        panneau.appendChild(suite);
        return;
      }

      // Flashcard : on retourne, puis on répond honnêtement.
      const montrerReponse = document.createElement('button');
      montrerReponse.type = 'button';
      montrerReponse.className = BOUTON;
      montrerReponse.textContent = 'Voir la réponse';
      montrerReponse.addEventListener('click', () => {
        const reponse = document.createElement('p');
        reponse.className =
          'rounded-lg bg-white px-3 py-2 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200';
        reponse.textContent = item.reponse ?? '';
        zone.appendChild(reponse);
        const su = document.createElement('button');
        su.type = 'button';
        su.className = BOUTON;
        su.textContent = 'Je savais';
        const pasSu = document.createElement('button');
        pasSu.type = 'button';
        pasSu.className = BOUTON;
        pasSu.textContent = 'Je ne savais pas';
        for (const [bouton, juste] of [
          [su, true],
          [pasSu, false],
        ] as const) {
          bouton.addEventListener('click', () => {
            su.disabled = true;
            pasSu.disabled = true;
            void conclure(item, juste).then(() => {
              position += 1;
              afficher();
            });
          });
        }
        suite.replaceChildren(su, pasSu);
      });
      suite.appendChild(montrerReponse);
      panneau.appendChild(suite);
    }

    afficher();
  });
}
