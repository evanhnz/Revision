<script lang="ts">
  /** Édition des flashcards : une question, une réponse. */
  import type { Carte } from '../../lib/editeur/modele';
  import { BOUTON_DISCRET, CHAMP } from './styles';

  let { cartes = $bindable() }: { cartes: Carte[] } = $props();

  function ajouter() {
    cartes = [...cartes, { question: '', reponse: '' }];
    requestAnimationFrame(() => {
      const champs = document.querySelectorAll<HTMLTextAreaElement>('[data-carte-question]');
      champs[champs.length - 1]?.focus();
    });
  }
  function retirer(i: number) {
    cartes = cartes.filter((_, k) => k !== i);
  }
  function deplacer(i: number, sens: -1 | 1) {
    const j = i + sens;
    if (j < 0 || j >= cartes.length) return;
    const copie = [...cartes];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    cartes = copie;
  }
</script>

<div class="space-y-3">
  {#if !cartes.length}
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Aucune carte. Une carte = une question précise et une réponse courte : elle revient en
      répétition espacée jusqu'à ce qu'elle soit sue.
    </p>
  {/if}
  {#each cartes as carte, i (i)}
    <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div class="mb-2 flex items-center gap-1">
        <span class="text-xs font-semibold text-slate-400">Carte {i + 1}</span>
        <span class="flex-1"></span>
        <button type="button" class={BOUTON_DISCRET} title="Monter" aria-label="Monter la carte {i + 1}" disabled={i === 0} onclick={() => deplacer(i, -1)}>↑</button>
        <button type="button" class={BOUTON_DISCRET} title="Descendre" aria-label="Descendre la carte {i + 1}" disabled={i === cartes.length - 1} onclick={() => deplacer(i, 1)}>↓</button>
        <button type="button" class="{BOUTON_DISCRET} hover:text-red-600" title="Supprimer" aria-label="Supprimer la carte {i + 1}" onclick={() => retirer(i)}>✕</button>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <label class="block">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Question</span>
          <textarea data-carte-question rows="2" class={CHAMP} bind:value={carte.question}></textarea>
        </label>
        <label class="block">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Réponse</span>
          <textarea rows="2" class={CHAMP} bind:value={carte.reponse}></textarea>
        </label>
      </div>
    </div>
  {/each}
  <button type="button" class="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-indigo-600 hover:border-indigo-400 dark:border-slate-600 dark:text-indigo-400" onclick={ajouter}>
    + Ajouter une carte
  </button>
</div>
