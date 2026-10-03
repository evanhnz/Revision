<script lang="ts">
  /** Édition du glossaire : terme, variantes, définition. */
  import type { Terme } from '../../lib/editeur/modele';
  import { BOUTON, BOUTON_DISCRET, CHAMP } from './styles';

  interface Props {
    termes: Terme[];
    occupe: boolean;
    onenregistrer: (termes: Terme[]) => void;
    onsale: (sale: boolean) => void;
  }
  let { termes, occupe, onenregistrer, onsale }: Props = $props();

  interface Ligne {
    terme: string;
    formes: string;
    definition: string;
  }
  const versLignes = (t: Terme[]): Ligne[] =>
    t.map((x) => ({ terme: x.terme, formes: x.formes.join(', '), definition: x.definition }));
  const depart = JSON.stringify(versLignes(termes));

  let lignes = $state<Ligne[]>(versLignes(termes).sort((a, b) => a.terme.localeCompare(b.terme, 'fr')));
  let recherche = $state('');

  const sale = $derived(JSON.stringify([...lignes].sort((a, b) => a.terme.localeCompare(b.terme, 'fr'))) !== JSON.stringify(JSON.parse(depart).sort((a: Ligne, b: Ligne) => a.terme.localeCompare(b.terme, 'fr'))));
  $effect(() => onsale(sale));

  const sansAccent = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visibles = $derived(
    lignes
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => !recherche.trim() || sansAccent(`${l.terme} ${l.formes} ${l.definition}`).includes(sansAccent(recherche))),
  );

  const erreurs = $derived.by(() => {
    const e: string[] = [];
    const vus = new Set<string>();
    lignes.forEach((l, i) => {
      if (!l.terme.trim() && !l.definition.trim()) return;
      if (!l.terme.trim()) e.push(`Ligne ${i + 1} : terme manquant.`);
      if (!l.definition.trim()) e.push(`« ${l.terme} » : définition manquante.`);
      const cle = sansAccent(l.terme.trim());
      if (cle && vus.has(cle)) e.push(`« ${l.terme} » figure deux fois.`);
      vus.add(cle);
    });
    return e;
  });

  function ajouter() {
    recherche = '';
    lignes = [{ terme: '', formes: '', definition: '' }, ...lignes];
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-terme]')?.focus());
  }

  function enregistrer() {
    onenregistrer(
      lignes
        .filter((l) => l.terme.trim())
        .map((l) => ({
          terme: l.terme.trim(),
          formes: l.formes.split(',').map((f) => f.trim()).filter(Boolean),
          definition: l.definition.trim(),
        })),
    );
  }
</script>

<div class="space-y-5">
  <div>
    <h2 class="text-xl font-bold text-slate-900 dark:text-white">Glossaire</h2>
    <p class="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
      Chaque terme est souligné automatiquement dans les cours et les fiches simplifiées, avec sa
      définition au clic. Les variantes (pluriels, féminins, sigles) sont détectées aussi ; la
      casse et les accents sont ignorés.
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <input type="search" class="{CHAMP} mt-0 max-w-xs" bind:value={recherche} placeholder="Rechercher…" aria-label="Rechercher un terme" />
    <button type="button" class="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-indigo-600 hover:border-indigo-400 dark:border-slate-600 dark:text-indigo-400" onclick={ajouter}>+ Nouveau terme</button>
    <span class="text-sm text-slate-400">{lignes.filter((l) => l.terme.trim()).length} terme(s)</span>
  </div>

  {#if !lignes.length}
    <p class="text-sm text-slate-500 dark:text-slate-400">Le glossaire est vide.</p>
  {/if}

  <ul class="space-y-2">
    {#each visibles as { l, i } (i)}
      <li class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label class="block">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Terme</span>
            <input data-terme type="text" class={CHAMP} bind:value={l.terme} placeholder="dol" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Variantes (séparées par des virgules)</span>
            <input type="text" class={CHAMP} bind:value={l.formes} placeholder="dols, dolosif" />
          </label>
          <button type="button" class="{BOUTON_DISCRET} self-end hover:text-red-600" aria-label="Supprimer {l.terme || 'ce terme'}" onclick={() => (lignes = lignes.filter((_, k) => k !== i))}>✕</button>
        </div>
        <label class="mt-2 block">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Définition</span>
          <textarea rows="2" class={CHAMP} bind:value={l.definition}></textarea>
        </label>
      </li>
    {/each}
  </ul>

  {#if erreurs.length}
    <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" role="alert">
      <ul class="list-disc pl-5">{#each erreurs as e (e)}<li>{e}</li>{/each}</ul>
    </div>
  {/if}

  <div class="sticky bottom-0 flex items-center gap-2 border-t border-slate-200 bg-white/90 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
    <button type="button" class={BOUTON} disabled={occupe || !sale || Boolean(erreurs.length)} onclick={enregistrer}>
      {occupe ? 'Enregistrement…' : 'Enregistrer le glossaire'}
    </button>
    <span class="text-xs text-slate-400">{sale ? 'Modifications non enregistrées' : 'À jour'}</span>
  </div>
</div>
