<script lang="ts">
  /** Arborescence des catégories et des fiches, récursive. */
  import Arbre from './Arbre.svelte';
  import { compterFiches, type Noeud } from '../../lib/editeur/modele';

  interface Props {
    noeuds: Noeud[];
    profondeur?: number;
    categorieActive: string[] | null;
    ficheActive: string | null;
    onchoisircategorie: (chemin: string[]) => void;
    onchoisirfiche: (fichier: string) => void;
  }
  let { noeuds, profondeur = 0, categorieActive, ficheActive, onchoisircategorie, onchoisirfiche }: Props = $props();

  const memeChemin = (a: string[] | null, b: string[]) =>
    Boolean(a) && a!.length === b.length && a!.every((s, i) => s.toLowerCase() === b[i].toLowerCase());
  const contientActif = (n: Noeud): boolean =>
    memeChemin(categorieActive, n.chemin) ||
    n.fiches.some((f) => f.fichier === ficheActive) ||
    n.enfants.some(contientActif) ||
    (categorieActive !== null && n.chemin.every((s, i) => categorieActive![i]?.toLowerCase() === s.toLowerCase()));

  /** Ouverture mémorisée par nœud ; par défaut, ouvert s'il mène à la sélection. */
  let ouverts = $state<Record<string, boolean>>({});
  const cle = (n: Noeud) => n.chemin.join('\u0000');
  const estOuvert = (n: Noeud) => ouverts[cle(n)] ?? contientActif(n);
</script>

<ul class={profondeur ? 'ml-3 border-l border-slate-200 pl-2 dark:border-slate-800' : ''}>
  {#each noeuds as n (cle(n))}
    {@const ouvert = estOuvert(n)}
    {@const vide = !n.enfants.length && !n.fiches.length}
    <li>
      <div
        class="group flex items-center rounded-lg {memeChemin(categorieActive, n.chemin)
          ? 'bg-indigo-50 dark:bg-indigo-950/50'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'}"
      >
        <button
          type="button"
          class="flex h-8 w-6 shrink-0 items-center justify-center text-xs text-slate-400 {vide ? 'invisible' : ''}"
          aria-label={ouvert ? `Replier ${n.nom}` : `Déplier ${n.nom}`}
          aria-expanded={ouvert}
          onclick={() => (ouverts[cle(n)] = !ouvert)}
        >
          {ouvert ? '▾' : '▸'}
        </button>
        <button
          type="button"
          class="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left text-sm {profondeur === 0
            ? 'font-semibold text-slate-900 dark:text-white'
            : 'font-medium text-slate-700 dark:text-slate-200'}"
          onclick={() => onchoisircategorie(n.chemin)}
        >
          {#if n.icone}<span aria-hidden="true">{n.icone}</span>{/if}
          <span class="truncate">{n.nom}</span>
          <span class="ml-auto shrink-0 text-xs font-normal text-slate-400">{compterFiches(n) || ''}</span>
        </button>
      </div>
      {#if ouvert}
        {#if n.enfants.length}
          <Arbre noeuds={n.enfants} profondeur={profondeur + 1} {categorieActive} {ficheActive} {onchoisircategorie} {onchoisirfiche} />
        {/if}
        {#if n.fiches.length}
          <ul class="ml-3 border-l border-slate-200 pl-2 dark:border-slate-800">
            {#each n.fiches as f (f.fichier)}
              <li>
                <button
                  type="button"
                  class="flex min-h-8 w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm {f.fichier === ficheActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'}"
                  onclick={() => onchoisirfiche(f.fichier)}
                >
                  <span aria-hidden="true" class="opacity-60">📄</span>
                  <span class="truncate">{f.analyse.meta?.titre}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </li>
  {/each}
</ul>
