<script lang="ts">
  /**
   * Un modèle spatial, dessiné sur ses axes.
   *
   * Une ligne de cases pour un système à un axe, une grille pour deux. La plage
   * entière de chaque axe est montrée, même là où aucune entité ne se trouve :
   * une grille tronquée donnerait une fausse idée des positions possibles, et
   * c'est justement ce que les moteurs d'indétermination travaillent.
   */
  import type { Axe } from '../systemes/types';

  let {
    axes = [] as Axe[],
    points = [] as { etiquette: string; coord: number[] }[],
    souligne = [] as string[],
  }: {
    axes: Axe[];
    points: { etiquette: string; coord: number[] }[];
    souligne?: string[];
  } = $props();

  const largeur = $derived(axes[0]?.taille ?? 1);
  const hauteur = $derived(axes.length > 1 ? (axes[1]?.taille ?? 1) : 1);

  /** Les entités d'une case. Plusieurs peuvent la partager. */
  function occupants(x: number, y: number): string[] {
    return points
      .filter((point) => point.coord[0] === x && (axes.length > 1 ? point.coord[1] === y : true))
      .map((point) => point.etiquette);
  }

  // Les lignes se lisent du haut vers le bas, donc de l'ordonnée la plus haute
  // à la plus basse.
  const lignes = $derived(
    Array.from({ length: hauteur }, (_, i) => hauteur - 1 - i),
  );
  const colonnes = $derived(Array.from({ length: largeur }, (_, i) => i));
</script>

<figure class="my-3 overflow-x-auto">
  <div class="inline-block">
    {#if axes.length > 1}
      <p class="mb-1 text-xs text-slate-500 dark:text-slate-400">
        Verticalement : {axes[1].libelle}. Horizontalement : {axes[0].libelle}.
      </p>
    {:else}
      <p class="mb-1 text-xs text-slate-500 dark:text-slate-400">{axes[0]?.libelle}</p>
    {/if}

    <div
      class="grid gap-1"
      style="grid-template-columns: repeat({largeur}, minmax(2.25rem, 1fr))"
    >
      {#each lignes as y (y)}
        {#each colonnes as x (x)}
          {@const dedans = occupants(x, y)}
          <div
            class="flex h-9 items-center justify-center rounded border text-xs font-medium
              {dedans.length
              ? 'border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-100'
              : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50'}
              {dedans.some((e) => souligne.includes(e))
              ? 'ring-2 ring-indigo-500 dark:ring-indigo-400'
              : ''}"
          >
            {dedans.join(' ')}
          </div>
        {/each}
      {/each}
    </div>
  </div>
</figure>
