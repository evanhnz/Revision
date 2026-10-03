<script lang="ts">
  /**
   * La session de Relational Reasoning : quelques items tirés dans les moteurs
   * ouverts, chacun à son propre échelon, correction immédiate, revue des
   * manqués à la fin.
   *
   * Un item dont le générateur a prévu un second temps compte pour **deux**
   * questions : le second temps est posé après correction du premier, et noté
   * séparément. Les compter pour une seule aurait pénalisé les items les plus
   * riches, qui sont précisément ceux qu'on veut voir revenir.
   *
   * L'espace « Comprendre » est consultable depuis l'accueil et n'interrompt
   * jamais une session. Le rappel d'une ligne au-dessus de chaque question est
   * le seul tutoriel en cours de session, et il se coupe.
   */
  import { ajouterSessionRelationnelle, toutesLesSessionsRelationnelles } from '../../../lib/db';
  import { gagnerXp, xpRelationnel } from '../../../lib/gamification';
  import Bloc from './Bloc.svelte';
  import Comprendre from './Comprendre.svelte';
  import Statistiques from './Statistiques.svelte';
  import type { Item, Option, Reponse } from '../moteurs/types';
  import { moteurParId } from '../moteurs/index';
  import { noter, type Donnee } from '../noyaux/notation';
  import { composerSession } from '../session';
  import {
    etatDesMoteurs,
    itemsReussis,
    prochainPalierSystemes,
    statistiques,
    type Trace,
  } from '../progression';

  type Etape = 'accueil' | 'question' | 'bilan';

  /** Une question posée : le temps principal d'un item, ou son second temps. */
  interface Question {
    item: Item;
    second: boolean;
    consigne: string;
    enonce: Item['enonce'];
    reponse: Reponse;
    explication: string;
  }

  const CLE_TUTORIELS = 'revinsp:rr:tutoriels';

  let etape = $state<Etape>('accueil');
  let chargement = $state(true);
  let traces = $state<Trace[]>([]);
  let longueur = $state(12);
  let comprendreOuvert = $state(false);
  let statsOuvert = $state(false);
  let tutoriels = $state(true);

  let questions = $state<Question[]>([]);
  let rang = $state(0);
  let corrige = $state(false);
  let resultats = $state<{ question: Question; note: number }[]>([]);
  let debut = 0;
  let xpGagne = $state(0);

  /**
   * Comment désigner une proposition dans le texte de la correction.
   *
   * Certaines propositions sont des dessins : elles n'ont pas de texte, et seul
   * leur rang permet d'en parler. Le dire en toutes lettres importe — une
   * correction qui ne tient qu'à la couleur des cases n'est lisible ni par tout
   * le monde, ni dans toutes les conditions.
   */
  function nommerOption(options: Option[] | undefined, i: number | null): string {
    if (i === null || i === undefined) return 'aucune';
    const texte = options?.[i]?.texte?.trim();
    return texte ? `« ${texte} »` : `la proposition ${i + 1}`;
  }

  function nommerPlusieurs(options: Option[] | undefined, indices: readonly number[]): string {
    if (!indices.length) return 'aucune';
    return indices.map((i) => nommerOption(options, i)).join(', ');
  }

  let choixUnique = $state<number | null>(null);
  let choixMultiples = $state<number[]>([]);
  let appariements = $state<Record<string, string>>({});

  const question = $derived(questions[rang]);
  const etats = $derived(etatDesMoteurs(traces));
  const ouverts = $derived(etats.filter((etat) => etat.ouvert));
  const palier = $derived(prochainPalierSystemes(traces));

  $effect(() => {
    // Le réglage des tutoriels est une commodité par appareil : il n'a pas sa
    // place dans la base de progression, qui se synchronise entre appareils.
    try {
      tutoriels = localStorage.getItem(CLE_TUTORIELS) !== 'non';
    } catch {
      /* navigation privée : le réglage vaudra pour cette page seulement */
    }
  });

  function basculerTutoriels() {
    tutoriels = !tutoriels;
    try {
      localStorage.setItem(CLE_TUTORIELS, tutoriels ? 'oui' : 'non');
    } catch {
      /* sans stockage, le réglage ne survit pas au rechargement */
    }
  }

  async function chargerTraces() {
    try {
      const sessions = await toutesLesSessionsRelationnelles();
      traces = sessions
        .slice()
        .sort((a, b) => a.le.localeCompare(b.le))
        .flatMap((session) => session.items);
    } catch {
      traces = [];
    }
    chargement = false;
  }
  chargerTraces();

  function questionsDe(item: Item): Question[] {
    const principale: Question = {
      item,
      second: false,
      consigne: item.consigne,
      enonce: item.enonce,
      reponse: item.reponse,
      explication: item.explication,
    };
    if (!item.suite) return [principale];
    return [
      principale,
      {
        item,
        second: true,
        consigne: item.suite.consigne,
        // Le second temps rappelle l'énoncé du premier : sans lui, il faudrait
        // se souvenir des paires, ce qui ferait de la mémoire l'exercice.
        enonce: [...item.enonce, ...item.suite.enonce],
        reponse: item.suite.reponse,
        explication: item.suite.explication,
      },
    ];
  }

  function commencer() {
    const session = composerSession(traces, longueur);
    questions = session.items.flatMap(questionsDe);
    rang = 0;
    corrige = false;
    resultats = [];
    xpGagne = 0;
    debut = Date.now();
    reinitialiserReponse();
    etape = questions.length ? 'question' : 'accueil';
  }

  function reinitialiserReponse() {
    choixUnique = null;
    choixMultiples = [];
    appariements = {};
  }

  const repondu = $derived.by(() => {
    if (!question) return false;
    if (question.reponse.genre === 'unique') return choixUnique !== null;
    if (question.reponse.genre === 'multiple') return choixMultiples.length > 0;
    return question.reponse.gauche.every((clef) => appariements[clef]);
  });

  function donnee(): Donnee {
    if (question.reponse.genre === 'unique') return { genre: 'unique', choix: choixUnique };
    if (question.reponse.genre === 'multiple') return { genre: 'multiple', choix: choixMultiples };
    return { genre: 'appariement', paires: appariements };
  }

  function valider() {
    if (!repondu || corrige) return;
    resultats = [...resultats, { question, note: noter(question.reponse, donnee()) }];
    corrige = true;
  }

  function basculerMultiple(index: number) {
    if (corrige) return;
    choixMultiples = choixMultiples.includes(index)
      ? choixMultiples.filter((i) => i !== index)
      : [...choixMultiples, index];
  }

  async function suivant() {
    if (rang + 1 < questions.length) {
      rang += 1;
      corrige = false;
      reinitialiserReponse();
      return;
    }
    await terminer();
  }

  async function terminer() {
    const secondes = Math.round((Date.now() - debut) / 1000);
    const reussis = resultats.filter((r) => r.note >= 1).length;
    const echelons = resultats.map(
      (r) => etats.find((e) => e.moteur.id === r.question.item.moteur)?.echelon ?? 1,
    );
    const echelonMoyen = echelons.length
      ? echelons.reduce((somme, e) => somme + e, 0) / echelons.length
      : 1;
    etape = 'bilan';

    const nouvelles: Trace[] = resultats.map((r) => ({
      moteur: r.question.item.moteur,
      systeme: r.question.item.systeme,
      note: r.note,
    }));

    try {
      await ajouterSessionRelationnelle({
        le: new Date().toISOString(),
        items: nouvelles,
        tentes: resultats.length,
        reussis,
        secondes,
      });
      const gain = await gagnerXp(xpRelationnel(reussis, echelonMoyen), {
        reponses: resultats.length,
        bonnes: reussis,
        secondes,
      });
      xpGagne = gain.xpGagne;
    } catch {
      // L'enregistrement peut échouer en navigation privée : le bilan
      // s'affiche quand même, seul le suivi est perdu.
    }
    traces = [...traces, ...nouvelles];
  }

  const manques = $derived(resultats.filter((r) => r.note < 1));
  const reussis = $derived(resultats.filter((r) => r.note >= 1).length);
  const partielles = $derived(resultats.filter((r) => r.note > 0 && r.note < 1).length);
  const nomMoteur = (id: string) => moteurParId(id)?.nom ?? id;
  const resumeMoteur = (id: string) => moteurParId(id)?.resume ?? '';
</script>

{#if chargement}
  <p class="py-16 text-center text-sm text-slate-400">Lecture de votre progression…</p>
{:else if etape === 'accueil'}
  <section class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="font-semibold text-slate-900 dark:text-white">Commencer une session</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {ouverts.length} exercice{ouverts.length > 1 ? 's' : ''} ouvert{ouverts.length > 1 ? 's' : ''},
          chacun à son propre niveau. {itemsReussis(traces)} item{itemsReussis(traces) > 1 ? 's' : ''}
          entièrement réussi{itemsReussis(traces) > 1 ? 's' : ''} jusqu'ici.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          onclick={() => (comprendreOuvert = !comprendreOuvert)}
          class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700
            hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200"
        >{comprendreOuvert ? 'Masquer les exercices' : 'Comprendre les exercices'}</button>
        <button
          type="button"
          onclick={() => (statsOuvert = !statsOuvert)}
          class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700
            hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200"
        >{statsOuvert ? 'Masquer la progression' : 'Ma progression'}</button>
      </div>
    </div>

    {#if comprendreOuvert}
      <Comprendre {etats} {tutoriels} onBasculerTutoriels={basculerTutoriels} />
    {/if}

    {#if statsOuvert}
      <Statistiques stats={statistiques(traces)} />
    {/if}

    <fieldset class="mt-5">
      <legend class="text-sm font-medium text-slate-700 dark:text-slate-200">Nombre d'items</legend>
      <div class="mt-2 flex gap-2">
        {#each [8, 12, 20] as n (n)}
          <button
            type="button"
            onclick={() => (longueur = n)}
            class="rounded-lg border px-4 py-2 text-sm font-medium
              {longueur === n
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'}"
          >{n}</button>
        {/each}
      </div>
    </fieldset>

    {#if palier}
      <p class="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Encore {palier.reste} item{palier.reste > 1 ? 's' : ''} entièrement réussi{palier.reste > 1 ? 's' : ''}
        pour ouvrir les systèmes « {palier.palier.nom} ».
      </p>
    {/if}

    <button
      type="button"
      onclick={commencer}
      class="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
    >Commencer</button>
  </section>
{:else if etape === 'question' && question}
  <section>
    <div class="mb-4 flex items-center justify-between gap-4">
      <p class="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
        {nomMoteur(question.item.moteur)}{question.second ? ' — second temps' : ''}
      </p>
      <p class="text-xs text-slate-500 dark:text-slate-400">{rang + 1} / {questions.length}</p>
    </div>

    <div class="h-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
      <div class="h-full bg-indigo-500 transition-all" style="width: {(rang / questions.length) * 100}%"></div>
    </div>

    {#if tutoriels && !question.second}
      <p class="mt-3 text-xs text-slate-500 dark:text-slate-400">{resumeMoteur(question.item.moteur)}</p>
    {/if}

    <h2 class="mt-4 font-semibold text-slate-900 dark:text-white">{question.consigne}</h2>

    {#each question.enonce as bloc, i (i)}
      <Bloc {bloc} />
    {/each}

    {#if question.reponse.genre === 'unique'}
      <div class="mt-4 space-y-2">
        {#each question.reponse.options as option, i (i)}
          <label class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm
            {corrige && i === question.reponse.bonne
              ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
              : corrige && i === choixUnique
                ? 'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40'
                : choixUnique === i
                  ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40'
                  : 'border-slate-200 dark:border-slate-800'}">
            <input type="radio" bind:group={choixUnique} value={i} disabled={corrige} class="mt-0.5" />
            <span class="min-w-0 text-slate-800 dark:text-slate-200">
              {option.texte ?? ''}
              {#if option.blocs}
                {#each option.blocs as bloc, j (j)}<Bloc {bloc} />{/each}
              {/if}
            </span>
          </label>
        {/each}
      </div>
    {:else if question.reponse.genre === 'multiple'}
      <p class="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Plusieurs réponses peuvent être correctes : cochez-les toutes. Une case juste rapporte, une
        case fausse retire autant — tout cocher ne rapporte rien.
      </p>
      <div class="mt-2 space-y-2">
        {#each question.reponse.options as option, i (i)}
          <label class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm
            {corrige && question.reponse.bonnes.includes(i)
              ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
              : corrige && choixMultiples.includes(i)
                ? 'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40'
                : choixMultiples.includes(i)
                  ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40'
                  : 'border-slate-200 dark:border-slate-800'}">
            <input
              type="checkbox"
              checked={choixMultiples.includes(i)}
              onchange={() => basculerMultiple(i)}
              disabled={corrige}
              class="mt-0.5"
            />
            <span class="min-w-0 text-slate-800 dark:text-slate-200">{option.texte ?? ''}</span>
          </label>
        {/each}
      </div>
    {:else}
      <div class="mt-4 space-y-2">
        {#each question.reponse.gauche as clef (clef)}
          <div class="flex flex-wrap items-center gap-3 rounded-lg border p-3
            {corrige
              ? appariements[clef] === question.reponse.paires[clef]
                ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40'
                : 'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40'
              : 'border-slate-200 dark:border-slate-800'}">
            <span class="min-w-8 font-mono text-base font-semibold text-slate-900 dark:text-white">{clef}</span>
            <span class="text-slate-400">→</span>
            <select
              bind:value={appariements[clef]}
              disabled={corrige}
              class="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm
                text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value={undefined}>— choisir —</option>
              {#each question.reponse.droite as valeur (valeur)}
                <option value={valeur}>{valeur}</option>
              {/each}
            </select>
            {#if corrige && appariements[clef] !== question.reponse.paires[clef]}
              <span class="text-xs text-slate-600 dark:text-slate-300">
                réponse : {question.reponse.paires[clef]}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if corrige}
      {@const dernier = resultats[resultats.length - 1]}
      {@const note = dernier?.note ?? 0}
      <div class="mt-5 rounded-lg border p-4 text-sm
        {note >= 1
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30'
          : note > 0
            ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
            : 'border-rose-300 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/30'}">
        <p class="font-semibold {note >= 1
          ? 'text-emerald-800 dark:text-emerald-200'
          : note > 0
            ? 'text-amber-800 dark:text-amber-200'
            : 'text-rose-800 dark:text-rose-200'}">
          {note >= 1
            ? 'Juste.'
            : note > 0
              ? `En partie : ${Math.round(note * 100)} %.`
              : 'Pas tout à fait.'}
        </p>
        <!--
          L'explication dit pourquoi la bonne réponse est bonne. Quand la
          réponse donnée ne l'était pas, elle laissait sans réponse la seule
          question que l'on se pose alors : « et ce que j'ai répondu, alors ? ».
          On nomme donc les deux, en toutes lettres.
        -->
        {#if note < 1 && question.reponse.genre === 'unique'}
          <p class="mt-1 text-slate-700 dark:text-slate-300">
            Vous avez répondu {nommerOption(question.reponse.options, choixUnique)} ; la réponse
            attendue était {nommerOption(question.reponse.options, question.reponse.bonne)}.
          </p>
        {:else if note < 1 && question.reponse.genre === 'multiple'}
          <p class="mt-1 text-slate-700 dark:text-slate-300">
            Vous avez coché {nommerPlusieurs(question.reponse.options, choixMultiples)} ; l'ensemble
            attendu était {nommerPlusieurs(question.reponse.options, question.reponse.bonnes)}.
          </p>
        {/if}
        <p class="mt-1 text-slate-700 dark:text-slate-300">{question.explication}</p>
      </div>
    {/if}

    <div class="mt-5 flex gap-3">
      {#if !corrige}
        <button
          type="button"
          onclick={valider}
          disabled={!repondu}
          class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white
            hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >Valider</button>
      {:else}
        <button
          type="button"
          onclick={suivant}
          class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >{rang + 1 < questions.length ? 'Question suivante' : 'Voir le bilan'}</button>
      {/if}
    </div>
  </section>
{:else}
  <section>
    <h2 class="font-semibold text-slate-900 dark:text-white">Bilan de la session</h2>
    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
      {reussis} réponse{reussis > 1 ? 's' : ''} exacte{reussis > 1 ? 's' : ''} sur {resultats.length}{#if partielles},
      et {partielles} partiellement juste{partielles > 1 ? 's' : ''}{/if}.
      {#if xpGagne}<span class="font-medium text-indigo-700 dark:text-indigo-300">+{xpGagne} XP.</span>{/if}
    </p>

    {#if manques.length}
      <h3 class="mt-6 text-sm font-semibold text-slate-900 dark:text-white">
        Les {manques.length} item{manques.length > 1 ? 's' : ''} à revoir
      </h3>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Relire une explication juste après la session vaut mieux que la remettre à plus tard.
      </p>
      <ul class="mt-3 space-y-3">
        {#each manques as manque, i (i)}
          <li class="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {nomMoteur(manque.question.item.moteur)}
              {#if manque.note > 0}— {Math.round(manque.note * 100)} %{/if}
            </p>
            <p class="mt-1 text-sm font-medium text-slate-900 dark:text-white">{manque.question.consigne}</p>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{manque.question.explication}</p>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-4 text-sm text-emerald-700 dark:text-emerald-300">Aucun item manqué.</p>
    {/if}

    <button
      type="button"
      onclick={() => (etape = 'accueil')}
      class="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
    >Nouvelle session</button>
  </section>
{/if}
