<script lang="ts">
  /** Gestion d'une catégorie : renommer, sous-catégories, ordre, suppression. */
  import {
    ajouterCategorie,
    compterFiches,
    deplacerCategorie,
    libelleChemin,
    renommerCategorie,
    supprimerCategorie,
    type FicheSource,
    type Modification,
    type Noeud,
  } from '../../lib/editeur/modele';
  import { BOUTON, BOUTON_DANGER, BOUTON_SECONDAIRE, CARTE, CHAMP } from './styles';

  interface Props {
    noeud: Noeud;
    racines: Noeud[];
    fiches: FicheSource[];
    occupe: boolean;
    onmodifier: (m: Modification, apres?: string[] | null) => void;
    onnouvellefiche: (chemin: string[]) => void;
    onchoisirfiche: (fichier: string) => void;
    onchoisircategorie: (chemin: string[]) => void;
  }
  let { noeud, racines, fiches, occupe, onmodifier, onnouvellefiche, onchoisirfiche, onchoisircategorie }: Props = $props();

  let nom = $state(noeud.nom);
  let icone = $state(noeud.icone ?? '');
  let sousCategorie = $state('');
  let erreur = $state('');

  const total = $derived(compterFiches(noeud));
  const position = $derived.by(() => {
    const liste = noeud.chemin.length > 1 ? (trouverParent()?.enfants ?? []) : racines;
    return { index: liste.findIndex((e) => e.nom === noeud.nom), taille: liste.length };
  });
  function trouverParent(): Noeud | undefined {
    let niveau = racines;
    let n: Noeud | undefined;
    for (const s of noeud.chemin.slice(0, -1)) {
      n = niveau.find((e) => e.nom.toLowerCase() === s.toLowerCase());
      if (!n) return undefined;
      niveau = n.enfants;
    }
    return n;
  }

  function tenter(action: () => void) {
    erreur = '';
    try {
      action();
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    }
  }

  const renommer = () =>
    tenter(() => {
      const m = renommerCategorie(racines, fiches, noeud.chemin, nom, noeud.chemin.length === 1 ? icone.trim() : undefined);
      onmodifier(m, [...noeud.chemin.slice(0, -1), nom.trim()]);
    });
  const ajouter = () =>
    tenter(() => {
      const m = ajouterCategorie(racines, noeud.chemin, sousCategorie);
      onmodifier(m, [...noeud.chemin, sousCategorie.trim()]);
      sousCategorie = '';
    });
  const deplacer = (sens: -1 | 1) =>
    tenter(() => {
      const m = deplacerCategorie(racines, noeud.chemin, sens);
      if (m) onmodifier(m, noeud.chemin);
    });
  const supprimer = () =>
    tenter(() => {
      const m = supprimerCategorie(racines, noeud.chemin);
      if (!confirm(`Supprimer la catégorie « ${noeud.nom} » ?`)) return;
      onmodifier(m, noeud.chemin.length > 1 ? noeud.chemin.slice(0, -1) : null);
    });
</script>

<div class="space-y-5">
  <div>
    <p class="text-xs font-medium tracking-wide text-slate-400 uppercase">
      {noeud.chemin.length === 1 ? 'Matière' : 'Catégorie'}
    </p>
    <h2 class="mt-1 text-xl font-bold text-slate-900 dark:text-white">
      {#if noeud.icone}<span aria-hidden="true">{noeud.icone}</span>{/if}
      {noeud.nom}
    </h2>
    {#if noeud.chemin.length > 1}
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{libelleChemin(noeud.chemin.slice(0, -1))}</p>
    {/if}
  </div>

  {#if erreur}
    <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">{erreur}</p>
  {/if}

  <!-- Contenu -->
  <section class={CARTE}>
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="flex-1 font-semibold text-slate-900 dark:text-white">
        Fiches <span class="text-sm font-normal text-slate-400">({total} au total, sous-catégories comprises)</span>
      </h3>
      <button type="button" class={BOUTON} onclick={() => onnouvellefiche(noeud.chemin)}>+ Nouvelle fiche ici</button>
    </div>
    {#if noeud.fiches.length}
      <ul class="mt-3 space-y-1">
        {#each noeud.fiches as f (f.fichier)}
          <li>
            <button type="button" class="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800" onclick={() => onchoisirfiche(f.fichier)}>
              📄 {f.analyse.meta?.titre}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Aucune fiche directement dans cette catégorie.</p>
    {/if}
    {#if noeud.enfants.length}
      <p class="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">Sous-catégories</p>
      <div class="mt-1 flex flex-wrap gap-2">
        {#each noeud.enfants as e (e.nom)}
          <button type="button" class={BOUTON_SECONDAIRE} onclick={() => onchoisircategorie(e.chemin)}>
            {e.nom} <span class="text-xs text-slate-400">{compterFiches(e)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Ajouter une sous-catégorie -->
  <section class={CARTE}>
    <h3 class="font-semibold text-slate-900 dark:text-white">Ajouter une sous-catégorie</h3>
    <form class="mt-3 flex flex-wrap gap-2" onsubmit={(e) => { e.preventDefault(); ajouter(); }}>
      <input type="text" class="{CHAMP} mt-0 min-w-56 flex-1" bind:value={sousCategorie} placeholder="Ex. : La formation du contrat" />
      <button type="submit" class={BOUTON} disabled={occupe || !sousCategorie.trim()}>Ajouter</button>
    </form>
  </section>

  <!-- Renommer -->
  <section class={CARTE}>
    <h3 class="font-semibold text-slate-900 dark:text-white">Renommer</h3>
    <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
      Les fiches de la catégorie et de ses sous-catégories sont mises à jour automatiquement.
    </p>
    <form class="mt-3 flex flex-wrap gap-2" onsubmit={(e) => { e.preventDefault(); renommer(); }}>
      {#if noeud.chemin.length === 1}
        <input type="text" class="{CHAMP} mt-0 w-20 text-center" bind:value={icone} placeholder="🙂" aria-label="Icône" maxlength="8" />
      {/if}
      <input type="text" class="{CHAMP} mt-0 min-w-56 flex-1" bind:value={nom} aria-label="Nom" />
      <button type="submit" class={BOUTON} disabled={occupe || !nom.trim() || (nom.trim() === noeud.nom && icone.trim() === (noeud.icone ?? ''))}>Enregistrer</button>
    </form>
  </section>

  <!-- Ordre et suppression -->
  <section class="{CARTE} flex flex-wrap items-center gap-2">
    <span class="mr-2 text-sm font-semibold text-slate-900 dark:text-white">Position</span>
    <button type="button" class={BOUTON_SECONDAIRE} disabled={occupe || position.index <= 0} onclick={() => deplacer(-1)}>↑ Monter</button>
    <button type="button" class={BOUTON_SECONDAIRE} disabled={occupe || position.index < 0 || position.index >= position.taille - 1} onclick={() => deplacer(1)}>↓ Descendre</button>
    <span class="flex-1"></span>
    <button type="button" class={BOUTON_DANGER} disabled={occupe || total > 0} title={total ? 'Videz d\'abord la catégorie' : ''} onclick={supprimer}>Supprimer la catégorie</button>
  </section>
</div>
