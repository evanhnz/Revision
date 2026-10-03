<script lang="ts">
  /**
   * Import de fiches au format standard : fichiers .md déposés, ou texte
   * collé (une ou plusieurs fiches à la suite, telles qu'un assistant les
   * produit). Chaque fiche est contrôlée avant d'être ajoutée.
   */
  import {
    analyser,
    decouperFichesCollees,
    libelleChemin,
    nouveauFichier,
    type Analyse,
  } from '../../lib/editeur/modele';
  import type { FichierSource } from '../../lib/editeur/depot';
  import { BOUTON, BOUTON_SECONDAIRE, CARTE, CHAMP_CODE } from './styles';
  import notice from '../../../NOTICE-FORMAT.md?raw';
  import { notifier } from '../../lib/ui';

  interface Props {
    fichiersExistants: string[];
    titresExistants: Set<string>;
    occupe: boolean;
    /** Catégories existantes, pour que l'assistant reprenne les mêmes noms. */
    chemins: string[][];
    onimporter: (fichiers: FichierSource[]) => void;
  }
  let { fichiersExistants, titresExistants, occupe, chemins, onimporter }: Props = $props();
  let noticeOuverte = $state(false);

  /** La notice, suivie de l'arborescence actuelle. */
  const noticeComplete = $derived(
    notice.trim() +
      '\n\n## Catégories existantes\n\n' +
      (chemins.length
        ? chemins.map((c) => `- ${JSON.stringify(c).replace(/","/g, '", "')}`).join('\n')
        : '(aucune pour l\'instant)') +
      '\n',
  );

  async function copierNotice() {
    try {
      await navigator.clipboard.writeText(noticeComplete);
      notifier('Notice copiée : collez-la dans votre conversation avec l\'assistant.', 'succes');
    } catch {
      noticeOuverte = true;
      notifier('Copie impossible ici : sélectionnez le texte de la notice.');
    }
  }

  interface Candidat {
    origine: string;
    texte: string;
    analyse: Analyse;
    retenu: boolean;
  }

  let candidats = $state<Candidat[]>([]);
  let colle = $state('');
  let survol = $state(false);

  function ajouterTextes(textes: { origine: string; texte: string }[]) {
    const nouveaux = textes.map(({ origine, texte }) => {
      const analyse = analyser(texte);
      return { origine, texte, analyse, retenu: Boolean(analyse.meta) && !analyse.erreurs.length };
    });
    candidats = [...candidats, ...nouveaux];
  }

  async function lireFichiers(liste: FileList | null) {
    if (!liste) return;
    const textes: { origine: string; texte: string }[] = [];
    for (const f of Array.from(liste)) {
      if (!/\.(md|markdown|txt)$/i.test(f.name)) {
        textes.push({ origine: f.name, texte: '' });
        continue;
      }
      const contenu = await f.text();
      const morceaux = decouperFichesCollees(contenu);
      morceaux.forEach((t, i) => textes.push({ origine: morceaux.length > 1 ? `${f.name} (${i + 1})` : f.name, texte: t }));
    }
    ajouterTextes(textes);
  }

  function analyserColle() {
    const morceaux = decouperFichesCollees(colle);
    ajouterTextes(morceaux.map((t, i) => ({ origine: `Texte collé${morceaux.length > 1 ? ` (${i + 1})` : ''}`, texte: t })));
    colle = '';
  }

  const retenus = $derived(candidats.filter((c) => c.retenu));

  function importer() {
    const pris = new Set(fichiersExistants);
    const sortie: FichierSource[] = [];
    for (const c of retenus) {
      const chemin = nouveauFichier(pris);
      pris.add(chemin);
      sortie.push({ chemin, contenu: c.texte.trim() + '\n' });
    }
    onimporter(sortie);
    candidats = [];
  }
</script>

<div class="space-y-5">
  <div>
    <h2 class="text-xl font-bold text-slate-900 dark:text-white">Importer des fiches</h2>
    <p class="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
      Déposez des fichiers <code>.md</code> au format standard, ou collez le texte d'une ou plusieurs
      fiches (par exemple produites dans une autre conversation à partir de vos cours). Les
      catégories inconnues sont créées automatiquement.
    </p>
  </div>

  <section class="{CARTE} flex flex-wrap items-center gap-3">
    <div class="min-w-64 flex-1">
      <h3 class="font-semibold text-slate-900 dark:text-white">Faire rédiger des fiches par un assistant</h3>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Copiez la notice de format (avec vos catégories actuelles), collez-la dans une conversation avec
        votre cours, puis collez ici la réponse obtenue.
      </p>
    </div>
    <button type="button" class={BOUTON} onclick={copierNotice}>📋 Copier la notice</button>
    <button type="button" class={BOUTON_SECONDAIRE} onclick={() => (noticeOuverte = !noticeOuverte)}>{noticeOuverte ? 'Masquer' : 'Voir'}</button>
    {#if noticeOuverte}
      <textarea class="{CHAMP_CODE} h-96" readonly value={noticeComplete}></textarea>
    {/if}
  </section>

  <section class="grid gap-4 lg:grid-cols-2">
    <label
      class="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition {survol
        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
        : 'border-slate-300 hover:border-indigo-400 dark:border-slate-700'}"
      ondragover={(e) => { e.preventDefault(); survol = true; }}
      ondragleave={() => (survol = false)}
      ondrop={(e) => { e.preventDefault(); survol = false; lireFichiers(e.dataTransfer?.files ?? null); }}
    >
      <span class="text-3xl" aria-hidden="true">📥</span>
      <span class="mt-2 font-medium text-slate-800 dark:text-slate-100">Déposer des fichiers .md</span>
      <span class="text-sm text-slate-500">ou cliquer pour choisir</span>
      <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple class="sr-only" onchange={(e) => { lireFichiers((e.currentTarget as HTMLInputElement).files); (e.currentTarget as HTMLInputElement).value = ''; }} />
    </label>
    <div class="flex flex-col">
      <textarea class="{CHAMP_CODE} mt-0 min-h-48 flex-1" bind:value={colle} spellcheck="false" placeholder={'---\ntitre: "…"\nchemin: ["Droit des obligations", "…"]\n---\n\n## Cours complet\n…'}></textarea>
      <button type="button" class="{BOUTON_SECONDAIRE} mt-2 self-start" disabled={!colle.trim()} onclick={analyserColle}>Analyser le texte collé</button>
    </div>
  </section>

  {#if candidats.length}
    <section class={CARTE}>
      <h3 class="font-semibold text-slate-900 dark:text-white">Contrôle avant import</h3>
      <ul class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {#each candidats as c, i (i)}
          {@const valide = Boolean(c.analyse.meta) && !c.analyse.erreurs.length}
          <li class="flex gap-3 py-3">
            <input type="checkbox" class="mt-1 h-4 w-4 accent-indigo-600" disabled={!valide} bind:checked={c.retenu} aria-label="Importer {c.origine}" />
            <div class="min-w-0 flex-1">
              <p class="font-medium text-slate-900 dark:text-white">
                {valide ? '✓' : '✕'} {c.analyse.meta?.titre ?? c.origine}
                {#if c.analyse.meta && titresExistants.has(c.analyse.meta.titre.toLowerCase())}
                  <span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">titre déjà présent</span>
                {/if}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {c.origine}{#if c.analyse.meta} · {libelleChemin(c.analyse.meta.chemin)} · {c.analyse.flashcards.length} carte(s), {c.analyse.quiz.length} question(s){/if}
              </p>
              {#if !c.texte}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">Format non pris en charge : seuls les fichiers texte (.md) s'importent.</p>
              {/if}
              {#each c.analyse.erreurs as e (e)}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{e}</p>{/each}
              {#each c.analyse.avertissements as a (a)}<p class="mt-1 text-sm text-amber-700 dark:text-amber-300">{a}</p>{/each}
            </div>
          </li>
        {/each}
      </ul>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" class={BOUTON} disabled={occupe || !retenus.length} onclick={importer}>
          Importer {retenus.length} fiche{retenus.length > 1 ? 's' : ''}
        </button>
        <button type="button" class={BOUTON_SECONDAIRE} onclick={() => (candidats = [])}>Vider la liste</button>
      </div>
    </section>
  {/if}
</div>
