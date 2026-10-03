<script lang="ts">
  /**
   * Éditeur d'une fiche : l'en-tête et les cinq sections, en onglets, plus la
   * source complète. Ce qui est enregistré est exactement le format standard,
   * celui qu'on peut aussi importer ou déposer à la main.
   */
  import {
    analyser,
    ecrire,
    libelleChemin,
    nomTelechargement,
    telecharger,
    type Carte,
    type FicheSource,
    type Question,
    type Terme,
  } from '../../lib/editeur/modele';
  import { flashcardsEnYaml, questionsEnYaml } from '../../../scripts/lib/fiche.mjs';
  import { rendreHtml } from '../../../scripts/lib/markdown.mjs';
  import { construireIndexGlossaire } from '../../../scripts/lib/glossaire.mjs';
  import ListeCartes from './ListeCartes.svelte';
  import ListeQuestions from './ListeQuestions.svelte';
  import { BOUTON, BOUTON_DANGER, BOUTON_SECONDAIRE, CHAMP, CHAMP_CODE } from './styles';

  interface Props {
    fiche: FicheSource | null;
    cheminInitial: string[];
    chemins: string[][];
    glossaire: Terme[];
    enregistrement: boolean;
    onenregistrer: (texte: string, message: string) => void;
    onsupprimer: () => void;
    onsale: (sale: boolean) => void;
  }
  let { fiche, cheminInitial, chemins, glossaire, enregistrement, onenregistrer, onsupprimer, onsale }: Props =
    $props();

  type Onglet = 'cours' | 'fiche' | 'flashcards' | 'quiz' | 'pretest' | 'source';

  // --- État initial, tiré de la source -------------------------------------
  const depart = fiche?.analyse;
  const lisible = !fiche || Boolean(depart?.meta && !depart.erreurs.length);
  const copieQuestions = (l: Question[]) =>
    l.map((q) => ({ ...q, options: [...q.options], bonnes: [...q.bonnes], explication: q.explication ?? '' }));

  let titre = $state(depart?.meta?.titre ?? '');
  let chemin = $state<string[]>(depart?.meta?.chemin ?? cheminInitial);
  let ordre = $state<string>(depart?.meta && depart.meta.ordre !== 999 ? String(depart.meta.ordre) : '');
  let tags = $state((depart?.meta?.tags ?? []).join(', '));
  let cours = $state(depart?.brut.cours ?? '');
  let resume = $state(depart?.brut.fiche ?? '');
  let cartes = $state<Carte[]>((depart?.flashcards ?? []).map((c) => ({ ...c })));
  let quiz = $state<Question[]>(copieQuestions(depart?.quiz ?? []));
  let pretest = $state<Question[]>(copieQuestions(depart?.pretest ?? []));

  // Une fiche illisible (importée à la main avec une erreur) s'ouvre sur sa
  // source : les formulaires ne peuvent pas représenter ce qu'ils ne lisent pas.
  let onglet = $state<Onglet>(lisible ? (depart?.brut.cours || !fiche ? 'cours' : depart?.brut.fiche ? 'fiche' : 'flashcards') : 'source');
  let source = $state(lisible ? '' : (fiche?.texte ?? ''));
  let erreurSource = $state('');
  let apercu = $state(false);

  // --- Sérialisation --------------------------------------------------------
  /** Retire les propositions vides en recalant les indices des bonnes réponses. */
  function nettoyerQuestions(liste: Question[]): Question[] {
    return liste
      .filter((q) => q.question.trim() || q.options.some((o) => o.trim()))
      .map((q) => {
        const garder = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
        return {
          question: q.question.trim(),
          options: garder.map((x) => x.o),
          bonnes: garder.map((x, k) => (q.bonnes.includes(x.i) ? k : -1)).filter((k) => k >= 0),
          explication: q.explication?.trim() || undefined,
        };
      });
  }

  function texteFormulaire(): string {
    const ordreNum = Number.parseInt(ordre, 10);
    return ecrire(
      {
        titre: titre.trim(),
        chemin,
        ordre: Number.isFinite(ordreNum) ? ordreNum : 999,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      },
      {
        cours,
        fiche: resume,
        flashcards: flashcardsEnYaml(cartes.filter((c) => c.question.trim() || c.reponse.trim()).map((c) => ({ question: c.question.trim(), reponse: c.reponse.trim() }))),
        quiz: questionsEnYaml(nettoyerQuestions(quiz)),
        pretest: questionsEnYaml(nettoyerQuestions(pretest)),
      },
    );
  }

  const texte = $derived(onglet === 'source' ? source : texteFormulaire());
  const analyse = $derived(analyser(texte));
  const erreursFormulaire = $derived.by(() => {
    if (onglet === 'source') return [];
    const e: string[] = [];
    if (!titre.trim()) e.push('Le titre est obligatoire.');
    if (!chemin.length) e.push('Choisissez une catégorie.');
    nettoyerQuestions(quiz).forEach((q, i) => {
      if (q.options.length < 2) e.push(`Quiz, question ${i + 1} : au moins deux propositions.`);
      else if (!q.bonnes.length) e.push(`Quiz, question ${i + 1} : cochez la bonne réponse.`);
    });
    nettoyerQuestions(pretest).forEach((q, i) => {
      if (q.options.length < 2) e.push(`Prétest, question ${i + 1} : au moins deux propositions.`);
      else if (!q.bonnes.length) e.push(`Prétest, question ${i + 1} : cochez la bonne réponse.`);
    });
    cartes.forEach((c, i) => {
      if (Boolean(c.question.trim()) !== Boolean(c.reponse.trim())) e.push(`Carte ${i + 1} : question et réponse sont toutes deux nécessaires.`);
    });
    return e;
  });
  // Les erreurs du formulaire sont plus parlantes ; celles de l'analyse
  // couvrent la source et ce que le formulaire ne vérifie pas.
  const erreurs = $derived(erreursFormulaire.length ? erreursFormulaire : analyse.erreurs);

  // Référence de comparaison : la fiche telle qu'ouverte (ou le formulaire vide).
  const texteInitial = fiche && !lisible ? fiche.texte : texteFormulaire();
  const sale = $derived(texte !== texteInitial);
  $effect(() => onsale(sale));

  // --- Bascule formulaire ↔ source -------------------------------------------
  function choisir(nouvel: Onglet) {
    if (nouvel === onglet) return;
    if (nouvel === 'source') {
      source = texteFormulaire();
      erreurSource = '';
      onglet = 'source';
      return;
    }
    if (onglet === 'source') {
      const a = analyser(source);
      if (!a.meta || a.erreurs.length) {
        erreurSource = 'Corrigez la source avant de revenir aux formulaires : ' + (a.erreurs[0] ?? 'en-tête illisible.');
        return;
      }
      titre = a.meta.titre;
      chemin = a.meta.chemin;
      ordre = a.meta.ordre !== 999 ? String(a.meta.ordre) : '';
      tags = a.meta.tags.join(', ');
      cours = a.brut.cours;
      resume = a.brut.fiche;
      cartes = a.flashcards.map((c: Carte) => ({ ...c }));
      quiz = copieQuestions(a.quiz);
      pretest = copieQuestions(a.pretest);
      erreurSource = '';
    }
    onglet = nouvel;
  }

  // --- Aperçu Markdown, avec le glossaire souligné ---------------------------
  const indexGlossaire = $derived(construireIndexGlossaire(glossaire, { longueurMinimale: 3 }));
  function rendu(markdown: string): string {
    try {
      return rendreHtml(markdown, indexGlossaire, {}) || '<p class="text-slate-400">Rien à afficher.</p>';
    } catch (e) {
      return `<p class="text-red-600">Aperçu impossible : ${e instanceof Error ? e.message : e}</p>`;
    }
  }

  // --- Catégorie ---------------------------------------------------------
  const cleChemin = (c: string[]) => JSON.stringify(c);
  const options = $derived.by(() => {
    const liste = chemins.map(cleChemin);
    if (chemin.length && !liste.includes(cleChemin(chemin))) liste.unshift(cleChemin(chemin));
    return liste;
  });

  function enregistrer() {
    if (erreurs.length) return;
    onenregistrer(texte, fiche ? `Modifie une fiche` : `Ajoute une fiche`);
  }

  function exporter() {
    telecharger(nomTelechargement(analyse.meta?.titre ?? titre), texte);
  }

  function raccourcis(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      enregistrer();
    }
  }

  const onglets: { id: Onglet; libelle: string; compte?: () => number }[] = [
    { id: 'pretest', libelle: 'Prétest', compte: () => nettoyerQuestions(pretest).length },
    { id: 'cours', libelle: 'Cours complet' },
    { id: 'fiche', libelle: 'Fiche simplifiée' },
    { id: 'flashcards', libelle: 'Flashcards', compte: () => cartes.filter((c) => c.question.trim()).length },
    { id: 'quiz', libelle: 'Quiz', compte: () => nettoyerQuestions(quiz).length },
    { id: 'source', libelle: 'Source .md' },
  ];
</script>

<svelte:window onkeydown={raccourcis} />

<div class="space-y-5">
  <!-- En-tête de la fiche -->
  {#if onglet !== 'source'}
    <div class="grid gap-3 sm:grid-cols-[1fr_120px]">
      <label class="block">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Titre</span>
        <input type="text" class="{CHAMP} text-base font-semibold" bind:value={titre} placeholder="Ex. : Les vices du consentement" />
      </label>
      <label class="block">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Ordre</span>
        <input type="number" class={CHAMP} bind:value={ordre} placeholder="auto" />
      </label>
      <label class="block">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Catégorie</span>
        <select
          class={CHAMP}
          value={cleChemin(chemin)}
          onchange={(e) => (chemin = JSON.parse((e.currentTarget as HTMLSelectElement).value))}
        >
          {#if !chemin.length}<option value="[]" disabled>Choisir une catégorie…</option>{/if}
          {#each options as o (o)}
            <option value={o}>{libelleChemin(JSON.parse(o))}</option>
          {/each}
        </select>
      </label>
      <label class="block">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Mots-clés</span>
        <input type="text" class={CHAMP} bind:value={tags} placeholder="dol, nullité" />
      </label>
    </div>
  {/if}

  <!-- Onglets -->
  <div class="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
    {#each onglets as o (o.id)}
      <button
        type="button"
        role="tab"
        aria-selected={onglet === o.id}
        class="-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition {onglet === o.id
          ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}"
        onclick={() => choisir(o.id)}
      >
        {o.libelle}{#if o.compte && onglet !== 'source'}<span class="ml-1 text-xs text-slate-400">({o.compte()})</span>{/if}
      </button>
    {/each}
  </div>

  {#if erreurSource}
    <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erreurSource}</p>
  {/if}

  <!-- Contenu de l'onglet -->
  {#if onglet === 'cours' || onglet === 'fiche'}
    <div>
      <div class="mb-2 flex items-center gap-2">
        <p class="flex-1 text-xs text-slate-500 dark:text-slate-400">
          Markdown : <code>### Titre de partie</code>, <code>**gras**</code>, <code>*italique*</code>,
          <code>- liste</code>, tableaux. Les termes du glossaire sont soulignés automatiquement.
        </p>
        <button type="button" class={BOUTON_SECONDAIRE} onclick={() => (apercu = !apercu)}>
          {apercu ? 'Écrire' : 'Aperçu'}
        </button>
      </div>
      {#if apercu}
        <div class="contenu min-h-64 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {@html rendu(onglet === 'cours' ? cours : resume)}
        </div>
      {:else if onglet === 'cours'}
        <textarea class={CHAMP_CODE} rows="22" bind:value={cours} placeholder={'### I. Première partie\n\nLe texte du cours…'}></textarea>
      {:else}
        <textarea class={CHAMP_CODE} rows="16" bind:value={resume} placeholder={'- **Texte** : art. 1137 C. civ.\n- **Idée clé** : …'}></textarea>
      {/if}
    </div>
  {:else if onglet === 'flashcards'}
    <ListeCartes bind:cartes />
  {:else if onglet === 'quiz'}
    <ListeQuestions bind:questions={quiz} nature="quiz" />
  {:else if onglet === 'pretest'}
    <ListeQuestions bind:questions={pretest} nature="pretest" />
  {:else}
    <div>
      <p class="mb-2 text-xs text-slate-500 dark:text-slate-400">
        La fiche entière, au format standard : c'est ce qui est enregistré, exporté et importé.
        Vous pouvez la modifier ou la remplacer directement.
      </p>
      <textarea class={CHAMP_CODE} rows="28" bind:value={source} spellcheck="false"></textarea>
    </div>
  {/if}

  <!-- Contrôle et enregistrement -->
  {#if erreurs.length}
    <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" role="alert">
      <p class="font-semibold">À corriger avant d'enregistrer :</p>
      <ul class="mt-1 list-disc pl-5">{#each erreurs as e (e)}<li>{e}</li>{/each}</ul>
    </div>
  {:else if analyse.avertissements.length}
    <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <ul class="list-disc pl-5">{#each analyse.avertissements as a (a)}<li>{a}</li>{/each}</ul>
    </div>
  {/if}

  <div class="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/90 px-1 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
    <button type="button" class={BOUTON} disabled={Boolean(erreurs.length) || enregistrement || (!sale && Boolean(fiche))} onclick={enregistrer}>
      {enregistrement ? 'Enregistrement…' : fiche ? 'Enregistrer' : 'Créer la fiche'}
    </button>
    <span class="text-xs text-slate-400">{sale ? 'Modifications non enregistrées' : fiche ? 'À jour' : ''} · Ctrl+S</span>
    <span class="flex-1"></span>
    <button type="button" class={BOUTON_SECONDAIRE} onclick={exporter} title="Télécharger la fiche au format .md">Exporter .md</button>
    {#if fiche}
      <button type="button" class={BOUTON_DANGER} disabled={enregistrement} onclick={onsupprimer}>Supprimer</button>
    {/if}
  </div>
</div>
