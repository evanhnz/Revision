/**
 * Prétest — s'essayer aux questions **avant** d'avoir lu.
 *
 * Tenter de répondre à une question avant d'avoir reçu l'enseignement
 * correspondant améliore la mémorisation de cet enseignement, y compris — et
 * surtout — quand la tentative échoue : l'erreur creuse la place où la bonne
 * réponse viendra se loger. La condition est qu'une vraie tentative ait lieu,
 * d'où le bouton « Valider » plutôt qu'un simple « suivant », et d'où aussi
 * l'absence totale d'enjeu.
 *
 * Trois règles en découlent, et elles sont plus importantes que le code :
 *
 *  - **Aucune pénalité.** La justesse ne rapporte rien et ne coûte rien. Seule
 *    la tentative donne une petite récompense forfaitaire. Noter la justesse
 *    installerait de l'anxiété exactement là où il ne faut pas.
 *  - **Le prétest ne nourrit pas le journal d'erreurs.** Se tromper ici est
 *    attendu ; ce n'est pas un oubli à rattraper. Ce module n'appelle donc rien
 *    du journal, et c'est délibéré.
 *  - **Une seule fois**, avant la première lecture du cours. Ensuite l'effet
 *    n'existe plus : la question ne précède plus rien.
 *
 * « Passer » n'est pas « répondre ». Le bouton existe pour qu'une consultation
 * rapide ne soit pas bloquée ; il met donc le prétest en sommeil pour la
 * journée, pas pour toujours. Le consommer définitivement sur un coup d'œil
 * reviendrait à le perdre pour la séance de travail qui vient.
 *
 * **La fiche porte un vivier, on en tire quelques questions.** Un prétest qui
 * poserait toujours les mêmes questions cesserait d'en être un dès le second
 * passage : la personne ne répondrait plus d'après ce qu'elle sait, mais
 * d'après la correction qu'elle a déjà lue. Or un second passage arrive — une
 * progression effacée par accident remet toutes les fiches à zéro. Le tirage
 * privilégie les questions jamais servies, et retombe sur le hasard quand la
 * mémoire de ce qui a été servi a disparu, ce qui est précisément le cas après
 * une réinitialisation.
 */
import type { Fiche, QuestionQuiz } from './contenu';
import { ecrireEtatFiche, jourISO, lireEtatFiche } from './db';
import { gagnerXp, xpPretest } from './gamification';
import { notifier } from './ui';

export type Issue = 'tente' | 'passe';

/**
 * Combien de questions poser à la fois.
 *
 * Assez pour amorcer la lecture, trop peu pour ressembler à un examen d'entrée.
 * Le reste du vivier attend un éventuel second passage.
 */
export const QUESTIONS_PAR_PRETEST = 3;

/** La fiche propose-t-elle un prétest ? */
export function aPretest(fiche: Pick<Fiche, 'pretest'>): boolean {
  return (fiche.pretest?.length ?? 0) > 0;
}

/**
 * Le prétest de cette fiche doit-il être proposé maintenant ?
 *
 * Non s'il a déjà été tenté, non s'il a été passé aujourd'hui, non si la fiche
 * a déjà été lue — après la lecture, il n'y a plus de « pré ».
 */
export async function aProposer(fiche: Pick<Fiche, 'id' | 'pretest'>): Promise<boolean> {
  if (!aPretest(fiche)) return false;
  const etat = await lireEtatFiche(fiche.id);
  if (!etat) return true;
  if (etat.lu || etat.pretesteeLe) return false;
  return etat.pretestPasseLe !== jourISO();
}

/**
 * Tire les questions à poser : d'abord celles jamais servies, puis, s'il en
 * manque, les moins récemment servies — au hasard dans chaque groupe.
 */
export function tirer(
  questions: readonly QuestionQuiz[],
  dejaVues: readonly string[] = [],
  combien = QUESTIONS_PAR_PRETEST,
): QuestionQuiz[] {
  const vues = new Set(dejaVues);
  const melanger = (liste: QuestionQuiz[]) => {
    const copie = [...liste];
    for (let i = copie.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  };
  const inedites = melanger(questions.filter((q) => !vues.has(q.id)));
  const revues = melanger(questions.filter((q) => vues.has(q.id)));
  return [...inedites, ...revues].slice(0, combien);
}

async function enregistrer(
  fiche: Pick<Fiche, 'id' | 'matiere'>,
  issue: Issue,
  servies: readonly string[] = [],
): Promise<void> {
  const etat = await lireEtatFiche(fiche.id);
  // L'étalement d'abord, pour ne rien effacer de ce que ce module ignore.
  await ecrireEtatFiche({
    ...etat,
    id: fiche.id,
    matiere: fiche.matiere,
    lu: etat?.lu ?? false,
    derniereOuverture: etat?.derniereOuverture ?? new Date().toISOString(),
    secondes: etat?.secondes ?? 0,
    // Les questions servies sont retenues quelle que soit l'issue : les avoir
    // vues suffit à les user, même sans y répondre.
    pretestVues: [...new Set([...(etat?.pretestVues ?? []), ...servies])],
    ...(issue === 'tente'
      ? { pretesteeLe: new Date().toISOString() }
      : { pretestPasseLe: jourISO() }),
  });
}

const CLASSE_OPTION =
  'flex w-full items-start gap-2 rounded-lg border border-slate-300 px-3 py-2 text-left text-sm ' +
  'transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';
const CLASSE_CHOISIE =
  'flex w-full items-start gap-2 rounded-lg border border-indigo-500 bg-indigo-50 px-3 py-2 ' +
  'text-left text-sm dark:border-indigo-400 dark:bg-indigo-950/50';

/**
 * Construit le prétest dans `hote` et rend la main quand la personne a tenté ou
 * passé. L'appelant affiche ensuite le cours.
 */
export async function montrer(
  fiche: Pick<Fiche, 'id' | 'matiere' | 'titre' | 'pretest'>,
  hote: HTMLElement,
): Promise<Issue> {
  // L'état est lu ici plutôt que reçu en argument : un appelant qui oublierait
  // de transmettre les questions déjà vues rejouerait exactement les mêmes, et
  // rien ne le signalerait.
  const etat = await lireEtatFiche(fiche.id);
  const questions = tirer(fiche.pretest ?? [], etat?.pretestVues ?? []);
  const servies = questions.map((q) => q.id);
  return new Promise<Issue>((terminer) => {
    const choix = questions.map(() => new Set<number>());
    let valide = false;

    const panneau = document.createElement('section');
    panneau.className =
      'rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-6 dark:border-indigo-900 dark:bg-indigo-950/30';

    const titre = document.createElement('h2');
    titre.className = 'text-lg font-bold text-slate-900 dark:text-white';
    titre.textContent = 'Avant de lire';
    const intro = document.createElement('p');
    intro.className = 'mt-1 text-sm text-slate-600 dark:text-slate-300';
    intro.textContent =
      'Essayez de répondre avant d’avoir lu le cours. Se tromper est normal, et c’est même ' +
      'ce qui rend la lecture plus efficace : rien ici n’est compté ni retenu contre vous.';
    panneau.append(titre, intro);

    const corps = document.createElement('div');
    corps.className = 'mt-4 space-y-5';
    panneau.appendChild(corps);

    questions.forEach((question: QuestionQuiz, i) => {
      const bloc = document.createElement('div');
      const enonce = document.createElement('p');
      enonce.className = 'font-medium text-slate-900 dark:text-slate-100';
      enonce.textContent = `${i + 1}. ${question.question}`;
      const multiple = question.bonnes.length > 1;
      const aide = document.createElement('p');
      aide.className = 'mt-0.5 text-xs text-slate-500 dark:text-slate-400';
      aide.textContent = multiple ? 'Plusieurs réponses possibles.' : 'Une seule réponse.';
      const liste = document.createElement('div');
      liste.className = 'mt-2 space-y-1.5';

      question.options.forEach((option, j) => {
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = CLASSE_OPTION;
        bouton.textContent = option;
        bouton.addEventListener('click', () => {
          if (valide) return;
          if (multiple) {
            if (choix[i].has(j)) choix[i].delete(j);
            else choix[i].add(j);
          } else {
            choix[i].clear();
            choix[i].add(j);
          }
          [...liste.children].forEach((enfant, k) => {
            (enfant as HTMLElement).className = choix[i].has(k) ? CLASSE_CHOISIE : CLASSE_OPTION;
          });
        });
        liste.appendChild(bouton);
      });

      bloc.append(enonce, aide, liste);
      corps.appendChild(bloc);
    });

    const actions = document.createElement('div');
    actions.className = 'mt-5 flex flex-wrap items-center gap-2';
    const valider = document.createElement('button');
    valider.type = 'button';
    valider.className =
      'min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition ' +
      'hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200';
    valider.textContent = 'Valider mes réponses';
    const passer = document.createElement('button');
    passer.type = 'button';
    passer.className =
      'min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium transition ' +
      'hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800';
    passer.textContent = 'Passer et lire le cours';
    actions.append(valider, passer);
    panneau.appendChild(actions);

    passer.addEventListener('click', () => {
      void enregistrer(fiche, 'passe', servies).then(() => {
        panneau.remove();
        terminer('passe');
      });
    });

    valider.addEventListener('click', () => {
      if (valide) return;
      valide = true;
      // La correction s'affiche, mais rien n'est noté : on montre où la lecture
      // va porter, pas un résultat.
      questions.forEach((question, i) => {
        const liste = corps.children[i].querySelector('div:last-child')!;
        [...liste.children].forEach((enfant, j) => {
          const bouton = enfant as HTMLButtonElement;
          bouton.disabled = true;
          const bonne = question.bonnes.includes(j);
          const cochee = choix[i].has(j);
          bouton.className =
            'flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm ' +
            (bonne
              ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-200'
              : cochee
                ? 'border-slate-400 bg-slate-100 text-slate-600 line-through dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400'
                : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400');
        });
        if (question.explication) {
          const note = document.createElement('p');
          note.className = 'mt-2 text-sm text-slate-600 dark:text-slate-300';
          note.textContent = question.explication;
          corps.children[i].appendChild(note);
        }
      });

      const tentees = choix.filter((c) => c.size > 0).length;
      valider.remove();
      passer.textContent = 'Lire le cours';
      const bilan = document.createElement('p');
      bilan.className = 'mt-4 text-sm text-slate-600 dark:text-slate-300';
      bilan.textContent = tentees
        ? 'Gardez ces questions en tête : le cours y répond. Rien n’a été compté.'
        : 'Rien n’a été coché — le cours répond quand même à ces questions.';
      panneau.insertBefore(bilan, actions);

      void (async () => {
        await enregistrer(fiche, 'tente', servies);
        if (tentees) {
          const gain = await gagnerXp(xpPretest());
          notifier(`+${gain.xpGagne} XP — prétest tenté`, 'succes');
          for (const badge of gain.nouveauxBadges) {
            notifier(`${badge.icone} Succès : ${badge.nom}`, 'badge');
          }
          if (gain.monteeDeNiveau) notifier(`🎉 Niveau ${gain.niveau.niveau} !`, 'succes');
        }
      })();

      passer.addEventListener(
        'click',
        () => {
          panneau.remove();
          terminer('tente');
        },
        { once: true },
      );
    });

    hote.replaceChildren(panneau);
    hote.classList.remove('hidden');
    panneau.scrollIntoView({ block: 'nearest' });
  });
}
