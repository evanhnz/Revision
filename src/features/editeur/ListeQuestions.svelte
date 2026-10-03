<script lang="ts">
  /** Édition d'une liste de QCM (quiz ou prétest). */
  import type { Question } from '../../lib/editeur/modele';
  import { BOUTON_DISCRET, CHAMP } from './styles';

  let {
    questions = $bindable(),
    nature,
  }: { questions: Question[]; nature: 'quiz' | 'pretest' } = $props();

  function ajouter() {
    questions = [...questions, { question: '', options: ['', ''], bonnes: [], explication: '' }];
    requestAnimationFrame(() => {
      const champs = document.querySelectorAll<HTMLTextAreaElement>(`[data-q="${nature}"]`);
      champs[champs.length - 1]?.focus();
    });
  }
  function retirer(i: number) {
    questions = questions.filter((_, k) => k !== i);
  }
  function deplacer(i: number, sens: -1 | 1) {
    const j = i + sens;
    if (j < 0 || j >= questions.length) return;
    const copie = [...questions];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    questions = copie;
  }
  function basculerBonne(q: Question, k: number) {
    q.bonnes = q.bonnes.includes(k) ? q.bonnes.filter((x) => x !== k) : [...q.bonnes, k].sort((a, b) => a - b);
  }
  function ajouterOption(q: Question) {
    q.options = [...q.options, ''];
  }
  function retirerOption(q: Question, k: number) {
    q.options = q.options.filter((_, x) => x !== k);
    q.bonnes = q.bonnes.filter((x) => x !== k).map((x) => (x > k ? x - 1 : x));
  }
</script>

<div class="space-y-3">
  {#if !questions.length}
    <p class="text-sm text-slate-500 dark:text-slate-400">
      {#if nature === 'pretest'}
        Le prétest est posé <strong>avant</strong> la première lecture du cours, sans note : se
        tromper avant d'avoir lu améliore la mémorisation. Prévoyez de 3 à 16 questions ; le site en
        tire trois au hasard.
      {:else}
        Aucune question. Cochez la ou les bonnes réponses ; l'explication s'affiche après la réponse.
      {/if}
    </p>
  {/if}
  {#each questions as q, i (i)}
    <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div class="mb-2 flex items-center gap-1">
        <span class="text-xs font-semibold text-slate-400">Question {i + 1}</span>
        {#if !q.bonnes.length}
          <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">aucune bonne réponse cochée</span>
        {/if}
        <span class="flex-1"></span>
        <button type="button" class={BOUTON_DISCRET} title="Monter" aria-label="Monter la question {i + 1}" disabled={i === 0} onclick={() => deplacer(i, -1)}>↑</button>
        <button type="button" class={BOUTON_DISCRET} title="Descendre" aria-label="Descendre la question {i + 1}" disabled={i === questions.length - 1} onclick={() => deplacer(i, 1)}>↓</button>
        <button type="button" class="{BOUTON_DISCRET} hover:text-red-600" title="Supprimer" aria-label="Supprimer la question {i + 1}" onclick={() => retirer(i)}>✕</button>
      </div>
      <label class="block">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Énoncé</span>
        <textarea data-q={nature} rows="2" class={CHAMP} bind:value={q.question}></textarea>
      </label>
      <fieldset class="mt-3">
        <legend class="text-xs font-medium text-slate-500 dark:text-slate-400">Propositions (cochez la ou les bonnes)</legend>
        <div class="mt-1 space-y-1.5">
          {#each q.options as _, k (k)}
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 accent-emerald-600"
                checked={q.bonnes.includes(k)}
                onchange={() => basculerBonne(q, k)}
                aria-label="Proposition {k + 1} correcte"
              />
              <input type="text" class="{CHAMP} mt-0" bind:value={q.options[k]} placeholder="Proposition {k + 1}" />
              <button type="button" class="{BOUTON_DISCRET} hover:text-red-600" aria-label="Retirer la proposition {k + 1}" disabled={q.options.length <= 2} onclick={() => retirerOption(q, k)}>✕</button>
            </div>
          {/each}
        </div>
        <button type="button" class="mt-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400" onclick={() => ajouterOption(q)}>+ proposition</button>
      </fieldset>
      <label class="mt-3 block">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Explication (facultative, affichée après la réponse)</span>
        <textarea rows="2" class={CHAMP} bind:value={q.explication}></textarea>
      </label>
    </div>
  {/each}
  <button type="button" class="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-indigo-600 hover:border-indigo-400 dark:border-slate-600 dark:text-indigo-400" onclick={ajouter}>
    + Ajouter une question
  </button>
</div>
