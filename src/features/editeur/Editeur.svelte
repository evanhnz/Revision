<script lang="ts">
  /**
   * Éditeur et gestionnaire de fiches.
   *
   * Travaille sur les fichiers sources (fiches .md, categories.yml,
   * glossaire.yml) par l'intermédiaire d'un « dépôt » : content/ en local,
   * le dépôt GitHub en ligne. Après chaque enregistrement, le site est
   * reconstruit et republié à partir de ces sources.
   */
  import { onMount } from 'svelte';
  import { zipSync, strToU8 } from 'fflate';
  import { obtenirDepot, DepotNonConfigure, type Depot, type EtatPublication, type FichierSource } from '../../lib/editeur/depot';
  import {
    ajouterCategorie,
    cheminsDisponibles,
    chargerContenu,
    construireArbre,
    FICHIER_GLOSSAIRE,
    glossaireEnYaml,
    nomTelechargement,
    telecharger,
    trouver,
    type Contenu,
    type Modification,
    type Terme,
  } from '../../lib/editeur/modele';
  import { notifier } from '../../lib/ui';
  import Arbre from './Arbre.svelte';
  import CategoriePanneau from './CategoriePanneau.svelte';
  import FicheEditeur from './FicheEditeur.svelte';
  import GlossaireEditeur from './GlossaireEditeur.svelte';
  import Importer from './Importer.svelte';
  import ConfigurationGitHub from './ConfigurationGitHub.svelte';
  import { BOUTON, BOUTON_SECONDAIRE, CARTE, CHAMP } from './styles';

  type Vue =
    | { type: 'accueil' }
    | { type: 'fiche'; fichier: string | null; chemin: string[] }
    | { type: 'categorie'; chemin: string[] }
    | { type: 'import' }
    | { type: 'glossaire' };

  let depot = $state<Depot | null>(null);
  let contenu = $state<Contenu | null>(null);
  let erreur = $state('');
  let nonConfigure = $state(false);
  let vue = $state<Vue>({ type: 'accueil' });
  let sale = $state(false);
  let occupe = $state(false);
  let publication = $state<EtatPublication>({ etat: 'prete' });
  /** Incrémenté à chaque rechargement : remonte l'éditeur de fiche ouvert. */
  let generation = $state(0);
  let nouvelleMatiere = $state('');

  const arbre = $derived(contenu ? construireArbre(contenu) : { racines: [], illisibles: [] });
  const chemins = $derived(cheminsDisponibles(arbre.racines));
  const ficheOuverte = $derived.by(() => {
    const v = vue;
    return v.type === 'fiche' && v.fichier ? (contenu?.fiches.find((f) => f.fichier === v.fichier) ?? null) : null;
  });
  const noeudOuvert = $derived(vue.type === 'categorie' ? trouver(arbre.racines, vue.chemin) : null);

  async function recharger() {
    if (!depot) return;
    contenu = await chargerContenu(depot);
    generation++;
  }

  async function demarrer() {
    erreur = '';
    nonConfigure = false;
    try {
      depot = await obtenirDepot();
      await recharger();
      ouvrirDepuisUrl();
    } catch (e) {
      if (e instanceof DepotNonConfigure) nonConfigure = true;
      else erreur = e instanceof Error ? e.message : String(e);
    }
  }

  async function reconfigurer() {
    if (sale && !confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')) return;
    const { oublierConfiguration } = await import('../../lib/editeur/depot-github');
    oublierConfiguration();
    sale = false;
    depot = null;
    contenu = null;
    erreur = '';
    nonConfigure = true;
  }

  function ouvrirDepuisUrl() {
    const p = new URLSearchParams(location.search);
    const fichier = p.get('fichier');
    const nouvelle = p.get('nouvelle');
    if (fichier && contenu?.fiches.some((f) => f.fichier === fichier)) {
      vue = { type: 'fiche', fichier, chemin: [] };
    } else if (nouvelle) {
      try {
        const chemin = JSON.parse(nouvelle);
        if (Array.isArray(chemin)) vue = { type: 'fiche', fichier: null, chemin: chemin.map(String) };
      } catch {
        /* paramètre illisible : on reste sur l'accueil */
      }
    }
  }

  onMount(() => {
    demarrer();
    const avertir = (e: BeforeUnloadEvent) => {
      if (sale) e.preventDefault();
    };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  });

  function naviguer(nouvelle: Vue) {
    if (sale && !confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')) return;
    sale = false;
    vue = nouvelle;
    if (window.innerWidth < 1024) document.getElementById('panneau-editeur')?.scrollIntoView({ behavior: 'smooth' });
  }

  // --- Publication ---------------------------------------------------------
  let suivi: number | null = null;
  function suivrePublication() {
    if (!depot) return;
    publication = { etat: 'en-cours' };
    if (suivi !== null) clearTimeout(suivi);
    const depart = Date.now();
    const verifier = async () => {
      publication = await depot!.publication();
      if (publication.etat === 'en-cours' && Date.now() - depart < 15 * 60_000) {
        suivi = window.setTimeout(verifier, depot!.nom === 'local' ? 700 : 8000);
      } else if (publication.etat === 'prete') {
        notifier(depot!.nom === 'local' ? 'Site mis à jour.' : 'Site republié.', 'succes');
      }
    };
    suivi = window.setTimeout(verifier, depot.nom === 'local' ? 500 : 5000);
  }

  // --- Écritures -------------------------------------------------------------
  async function ecrire(fichiers: FichierSource[], message: string): Promise<boolean> {
    if (!depot) return false;
    occupe = true;
    try {
      await depot.ecrirePlusieurs(fichiers, message);
      sale = false;
      await recharger();
      suivrePublication();
      return true;
    } catch (e) {
      notifier(`Échec de l'enregistrement : ${e instanceof Error ? e.message : e}`);
      return false;
    } finally {
      occupe = false;
    }
  }

  async function enregistrerFiche(texte: string, message: string) {
    if (vue.type !== 'fiche' || !contenu) return;
    const fichier = vue.fichier ?? (await import('../../lib/editeur/modele')).nouveauFichier(contenu.fiches.map((f) => f.fichier));
    const vueAvant = vue;
    if (await ecrire([{ chemin: fichier, contenu: texte }], message)) {
      // Si l'on a navigué ailleurs pendant l'enregistrement, on y reste.
      if (vue === vueAvant) vue = { type: 'fiche', fichier, chemin: [] };
      notifier('Fiche enregistrée.', 'succes');
    }
  }

  async function supprimerFiche() {
    if (vue.type !== 'fiche' || !vue.fichier || !depot) return;
    if (!confirm('Supprimer définitivement cette fiche ?')) return;
    const chemin = ficheOuverte?.analyse.meta?.chemin;
    occupe = true;
    try {
      await depot.supprimer(vue.fichier, 'Supprime une fiche');
      sale = false;
      await recharger();
      suivrePublication();
      vue = chemin ? { type: 'categorie', chemin } : { type: 'accueil' };
      notifier('Fiche supprimée.');
    } catch (e) {
      notifier(`Échec de la suppression : ${e instanceof Error ? e.message : e}`);
    } finally {
      occupe = false;
    }
  }

  async function modifierArbre(m: Modification, apres?: string[] | null) {
    if (await ecrire(m.ecritures, m.message)) {
      vue = apres ? { type: 'categorie', chemin: apres } : { type: 'accueil' };
    }
  }

  async function creerMatiere() {
    try {
      const nom = nouvelleMatiere.trim();
      await modifierArbre(ajouterCategorie(arbre.racines, [], nom), [nom]);
      nouvelleMatiere = '';
    } catch (e) {
      notifier(e instanceof Error ? e.message : String(e));
    }
  }

  async function enregistrerGlossaire(termes: Terme[]) {
    if (await ecrire([{ chemin: FICHIER_GLOSSAIRE, contenu: glossaireEnYaml(termes) }], 'Met à jour le glossaire')) {
      notifier('Glossaire enregistré.', 'succes');
    }
  }

  async function importer(fichiers: FichierSource[]) {
    if (await ecrire(fichiers, `Importe ${fichiers.length} fiche(s)`)) {
      notifier(`${fichiers.length} fiche(s) importée(s).`, 'succes');
      vue = { type: 'accueil' };
    }
  }

  /** Archive de toutes les sources, fiches nommées d'après leur titre. */
  function toutExporter() {
    if (!contenu) return;
    const fichiers: Record<string, Uint8Array> = {};
    const pris = new Set<string>();
    for (const f of contenu.fiches) {
      const dossier = f.analyse.meta ? f.analyse.meta.chemin.map((s) => nomTelechargement(s).replace(/\.md$/, '')).join('/') : 'illisibles';
      let nom = `${dossier}/${nomTelechargement(f.analyse.meta?.titre ?? f.fichier)}`;
      for (let i = 2; pris.has(nom); i++) nom = nom.replace(/(-\d+)?\.md$/, `-${i}.md`);
      pris.add(nom);
      fichiers[`fiches/${nom}`] = strToU8(f.texte);
    }
    if (depot) {
      depot.lister().then((sources) => {
        for (const s of sources) if (!s.chemin.endsWith('.md')) fichiers[s.chemin] = strToU8(s.contenu);
        const date = new Date().toISOString().slice(0, 10);
        telecharger(`fiches-${date}.zip`, zipSync(fichiers, { level: 6 }) as BlobPart, 'application/zip');
      });
    }
  }

  const titresExistants = $derived(new Set((contenu?.fiches ?? []).map((f) => f.analyse.meta?.titre.toLowerCase() ?? '')));
  const totalCartes = $derived((contenu?.fiches ?? []).reduce((n, f) => n + f.analyse.flashcards.length, 0));
  const totalQuiz = $derived((contenu?.fiches ?? []).reduce((n, f) => n + f.analyse.quiz.length, 0));
</script>

{#if nonConfigure}
  <ConfigurationGitHub onconfigure={demarrer} />
{:else if erreur}
  <div class="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 px-5 py-6 text-center dark:border-red-900 dark:bg-red-950/40" role="alert">
    <p class="font-semibold text-red-800 dark:text-red-200">Les fiches sources n'ont pas pu être chargées.</p>
    <p class="mt-2 text-sm break-words text-red-700 dark:text-red-300">{erreur}</p>
    <div class="mt-4 flex flex-wrap justify-center gap-2">
      <button type="button" class={BOUTON} onclick={demarrer}>Réessayer</button>
      {#if !import.meta.env.DEV}
        <button type="button" class={BOUTON_SECONDAIRE} onclick={reconfigurer}>Reconfigurer GitHub</button>
      {/if}
    </div>
  </div>
{:else if !contenu}
  <p class="py-20 text-center text-slate-400">Chargement des fiches sources…</p>
{:else}
  <div class="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
    <!-- Colonne de gauche : outils et arborescence -->
    <aside class="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="{BOUTON} col-span-2" onclick={() => naviguer({ type: 'fiche', fichier: null, chemin: vue.type === 'categorie' ? vue.chemin : [] })}>+ Nouvelle fiche</button>
        <button type="button" class={BOUTON_SECONDAIRE} onclick={() => naviguer({ type: 'import' })}>📥 Importer</button>
        <button type="button" class={BOUTON_SECONDAIRE} onclick={() => naviguer({ type: 'glossaire' })}>📖 Glossaire</button>
      </div>

      <nav aria-label="Arborescence des fiches" class="rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        <button type="button" class="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold tracking-wide text-slate-400 uppercase hover:bg-slate-100 dark:hover:bg-slate-800" onclick={() => naviguer({ type: 'accueil' })}>
          Toutes les matières
        </button>
        <Arbre
          noeuds={arbre.racines}
          categorieActive={vue.type === 'categorie' ? vue.chemin : null}
          ficheActive={vue.type === 'fiche' ? vue.fichier : null}
          onchoisircategorie={(chemin) => naviguer({ type: 'categorie', chemin })}
          onchoisirfiche={(fichier) => naviguer({ type: 'fiche', fichier, chemin: [] })}
        />
        <form class="mt-2 flex gap-1 border-t border-slate-100 pt-2 dark:border-slate-800" onsubmit={(e) => { e.preventDefault(); creerMatiere(); }}>
          <input type="text" class="{CHAMP} mt-0 py-1.5 text-xs" bind:value={nouvelleMatiere} placeholder="Nouvelle matière…" aria-label="Nom de la nouvelle matière" />
          <button type="submit" class="{BOUTON_SECONDAIRE} min-h-8 px-2 py-1 text-xs" disabled={!nouvelleMatiere.trim() || occupe}>Ajouter</button>
        </form>
      </nav>

      {#if arbre.illisibles.length}
        <div class="rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <p class="text-xs font-semibold text-red-700 dark:text-red-300">Fiches à corriger ({arbre.illisibles.length})</p>
          <ul class="mt-1">
            {#each arbre.illisibles as f (f.fichier)}
              <li>
                <button type="button" class="w-full truncate rounded px-1 py-1 text-left text-sm text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40" onclick={() => naviguer({ type: 'fiche', fichier: f.fichier, chemin: [] })}>{f.fichier}</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="text-xs text-slate-500 dark:text-slate-400">
        <p>
          {#if publication.etat === 'en-cours'}⏳ {depot?.nom === 'local' ? 'Mise à jour du site…' : 'Publication en cours (1 à 3 min)…'}
          {:else if publication.etat === 'erreur'}<span class="text-red-600 dark:text-red-400">⚠ La dernière publication a échoué.</span>
          {:else}✓ Site à jour{/if}
        </p>
        {#if publication.etat === 'erreur' && publication.message}
          <pre class="mt-1 max-h-40 overflow-auto rounded bg-slate-100 p-2 text-[11px] whitespace-pre-wrap dark:bg-slate-800">{publication.message}</pre>
        {/if}
        <p class="mt-1">Enregistrement : {depot?.description}</p>
        {#if depot?.nom === 'github'}
          <button type="button" class="mt-1 underline hover:text-slate-700 dark:hover:text-slate-200" onclick={reconfigurer}>Changer de jeton ou déconnecter ce navigateur</button>
        {/if}
      </div>
    </aside>

    <!-- Panneau principal -->
    <section id="panneau-editeur" class="min-w-0">
      {#if vue.type === 'fiche'}
        {#key `${vue.fichier ?? 'nouvelle'}:${generation}`}
          <FicheEditeur
            fiche={ficheOuverte}
            cheminInitial={vue.chemin}
            {chemins}
            glossaire={contenu.glossaire}
            enregistrement={occupe}
            onenregistrer={enregistrerFiche}
            onsupprimer={supprimerFiche}
            onsale={(s) => (sale = s)}
          />
        {/key}
      {:else if vue.type === 'categorie' && noeudOuvert}
        {#key `${vue.chemin.join('/')}:${generation}`}
          <CategoriePanneau
            noeud={noeudOuvert}
            racines={arbre.racines}
            fiches={contenu.fiches}
            {occupe}
            onmodifier={modifierArbre}
            onnouvellefiche={(chemin) => naviguer({ type: 'fiche', fichier: null, chemin })}
            onchoisirfiche={(fichier) => naviguer({ type: 'fiche', fichier, chemin: [] })}
            onchoisircategorie={(chemin) => naviguer({ type: 'categorie', chemin })}
          />
        {/key}
      {:else if vue.type === 'import'}
        <Importer fichiersExistants={contenu.fiches.map((f) => f.fichier)} {titresExistants} {occupe} {chemins} onimporter={importer} />
      {:else if vue.type === 'glossaire'}
        {#key generation}
          <GlossaireEditeur termes={contenu.glossaire} {occupe} onenregistrer={enregistrerGlossaire} onsale={(s) => (sale = s)} />
        {/key}
      {:else}
        <div class="space-y-5">
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">Éditeur de fiches</h2>
            <p class="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Choisissez une matière ou une fiche dans l'arborescence, créez une fiche, ou importez des
              fichiers au format standard.
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-4">
            {#each [[contenu.fiches.length, 'fiches'], [totalCartes, 'flashcards'], [totalQuiz, 'questions de quiz'], [contenu.glossaire.length, 'termes de glossaire']] as [n, l] (l)}
              <div class={CARTE}>
                <p class="text-2xl font-bold text-slate-900 dark:text-white">{n}</p>
                <p class="text-sm text-slate-500 dark:text-slate-400">{l}</p>
              </div>
            {/each}
          </div>
          {#if contenu.problemes.length}
            <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {#each contenu.problemes as p (p)}<p>{p}</p>{/each}
            </div>
          {/if}
          <div class={CARTE}>
            <h3 class="font-semibold text-slate-900 dark:text-white">Sauvegarde</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Téléchargez toutes vos fiches, le glossaire et l'arborescence dans une archive .zip, rangés
              par catégorie et lisibles sans le site.
            </p>
            <button type="button" class="{BOUTON_SECONDAIRE} mt-3" onclick={toutExporter} disabled={!contenu.fiches.length && !contenu.glossaire.length}>⬇ Tout exporter (.zip)</button>
          </div>
        </div>
      {/if}
    </section>
  </div>
{/if}
