<script lang="ts">
  /**
   * Le rendu d'un stimulus : une forme à regarder, ou un son à écouter.
   *
   * Les couleurs sont données en `oklch`, dont la clarté et la teinte sont
   * perceptivement régulières — ce qui est ici une exigence et non une
   * commodité. En `hsl`, deux pas de clarté séparés par le même écart numérique
   * ne se ressemblent pas du tout selon la teinte, et le seuil mesuré ne
   * voudrait plus rien dire.
   *
   * Un stimulus sonore ne se montre pas : il se joue. Le bouton reste donc
   * disponible pour le réécouter autant de fois qu'on veut — ce qui n'altère pas
   * la mesure, la difficulté portant sur la mise en correspondance et non sur la
   * mémoire.
   */
  import { jouerTon } from '../audio';
  import type { Stimulus } from '../stimulus';

  let {
    stimulus,
    /** Teinte parasite, quand le bruit de surface est actif. */
    parasite = undefined as number | undefined,
    /** La référence n'est montrée qu'en partie : il faut la compléter. */
    partiel = false,
    libelle = '',
    auto = false,
  }: {
    stimulus: Stimulus;
    parasite?: number;
    partiel?: boolean;
    libelle?: string;
    auto?: boolean;
  } = $props();

  let joue = $state(false);

  const teinte = $derived(parasite ?? stimulus.teinte);

  async function ecouter() {
    if (joue) return;
    joue = true;
    await jouerTon({
      frequenceHz: stimulus.frequenceHz,
      niveauDb: stimulus.niveauDb,
      // Une référence partielle est tronquée : on n'en entend que le début, et
      // il faut en inférer la durée entière.
      dureeMs: partiel ? stimulus.dureeMs * 0.45 : stimulus.dureeMs,
    });
    joue = false;
  }

  $effect(() => {
    if (auto && stimulus.modalite === 'auditive') ecouter();
  });
</script>

{#if stimulus.modalite === 'auditive'}
  <button
    type="button"
    onclick={ecouter}
    class="flex h-24 w-full min-w-24 flex-col items-center justify-center gap-1 rounded-lg border
      border-slate-200 bg-slate-50 text-sm text-slate-600 transition hover:border-indigo-300
      dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
    aria-label="Écouter {libelle}"
  >
    <span class="text-2xl" aria-hidden="true">{joue ? '🔊' : '🔈'}</span>
    <span class="text-xs">{joue ? 'en cours…' : 'écouter'}</span>
  </button>
{:else if stimulus.dimension === 'position'}
  <div class="flex h-24 w-full items-center px-2">
    <div class="relative h-1 w-full rounded bg-slate-200 dark:bg-slate-700">
      <span
        class="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500"
        style="left: {stimulus.positionPct}%"
      ></span>
    </div>
  </div>
{:else}
  <div class="flex h-24 w-full items-center justify-center overflow-hidden">
    {#if stimulus.dimension === 'taille'}
      <span
        class="block rounded-full"
        style="width: {stimulus.taillePx}px; height: {stimulus.taillePx}px;
          background: oklch(0.68 {parasite === undefined ? 0 : 0.16} {teinte});
          {partiel ? 'clip-path: inset(0 50% 0 0);' : ''}"
      ></span>
    {:else if stimulus.dimension === 'luminosite'}
      <span
        class="block h-16 w-16 rounded"
        style="background: oklch({stimulus.clarte / 100} {parasite === undefined ? 0 : 0.1} {teinte});
          {partiel ? 'clip-path: inset(0 50% 0 0);' : ''}"
      ></span>
    {:else if stimulus.dimension === 'teinte'}
      <span
        class="block h-16 w-16 rounded"
        style="background: oklch(0.7 0.16 {stimulus.teinte});
          {partiel ? 'clip-path: inset(0 50% 0 0);' : ''}"
      ></span>
    {:else}
      <span class="text-sm text-slate-400">—</span>
    {/if}
  </div>
{/if}
