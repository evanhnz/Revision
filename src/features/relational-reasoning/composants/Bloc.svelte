<script lang="ts">
  /**
   * Affiche un bloc d'énoncé, quel qu'en soit le type.
   *
   * C'est le seul point de l'interface qui connaisse les variantes de `Bloc`.
   * Un moteur qui a besoin d'un affichage nouveau ajoute une variante ici, et
   * non un composant de session.
   */
  import type { Bloc } from '../moteurs/types';
  import Graphe from './Graphe.svelte';
  import Grille from './Grille.svelte';

  let { bloc }: { bloc: Bloc } = $props();
</script>

{#if bloc.type === 'texte'}
  <p class="my-2 text-sm text-slate-600 dark:text-slate-300">{bloc.texte}</p>
{:else if bloc.type === 'faits'}
  <ul class="my-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
    {#each bloc.phrases as phrase, i (i)}
      <li class="font-mono text-sm text-slate-800 dark:text-slate-200">{phrase}</li>
    {/each}
  </ul>
{:else if bloc.type === 'grille'}
  <Grille axes={bloc.axes} points={bloc.points} souligne={bloc.souligne ?? []} />
{:else if bloc.type === 'graphe'}
  <Graphe noeuds={bloc.noeuds} aretes={bloc.aretes} manquante={bloc.manquante} />
{:else if bloc.type === 'tableau'}
  <div class="my-3 overflow-x-auto">
    <table class="text-sm">
      <thead>
        <tr>
          {#each bloc.entetes as entete, i (i)}
            <th class="border border-slate-200 bg-slate-100 px-2 py-1 font-semibold text-slate-700
              dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200">{entete}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each bloc.lignes as ligne, i (i)}
          <tr>
            {#each ligne as cellule, j (j)}
              <td class="border border-slate-200 px-2 py-1 text-center dark:border-slate-800
                {j === 0
                  ? 'bg-slate-100 font-semibold dark:bg-slate-800'
                  : 'font-mono text-slate-700 dark:text-slate-300'}">{cellule}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
