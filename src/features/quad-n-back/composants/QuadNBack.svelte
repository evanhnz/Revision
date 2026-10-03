<script>
  /**
   * Exercice Quad N-Back : écran de réglages, boucle de jeu, bilan.
   *
   * La logique de jeu vient de « quad-box » (licence MIT, voir
   * LICENCE-quad-box.txt) ; l'enchaînement des écrans, le stockage et la
   * gamification sont ceux du site — une seule base IndexedDB, un seul
   * système d'XP, de badges et de série de jours.
   */
  import { onMount, onDestroy } from 'svelte';
  import Grille from './Grille.svelte';
  import {
    genererPartie,
    calculerScore,
    progressionAutomatique,
    titrePartie,
    nomMode,
    DIMENSIONS,
    EXCLUSIONS,
    SOURCES_MOTIF,
    PROGRESSION_DEFAUT,
  } from '../moteur/nback.js';
  import { lecteurAudio } from '../moteur/audio.js';
  import { ajouterSessionNBack, toutesLesSessionsNBack } from '../../../lib/db';
  import { gagnerXp, xpNBack } from '../../../lib/gamification';
  import { notifier } from '../../../lib/ui';

  const CLE_REGLAGES = 'revinsp.nback.reglages';

  /** Touches par défaut : les quatre doigts de la main gauche, comme quad-box. */
  const TOUCHES_DEFAUT = Object.fromEntries(DIMENSIONS.map((d) => [d.cle, d.touche]));

  const REGLAGES_DEFAUT = {
    // Valeurs par défaut de quad-box : 30 épreuves, 2,5 s, 25 % de
    // correspondances, 20 % d'interférence.
    n: 2,
    epreuves: 30,
    dureeEpreuve: 2500,
    tauxCorrespondance: 25,
    interference: 20,
    dimensions: ['position', 'couleur', 'forme', 'son'],
    sourceMotif: 'voronoi',
    grille3D: true,
    retourImmediat: true,
    progression: { ...PROGRESSION_DEFAUT },
    touches: { ...TOUCHES_DEFAUT },
  };

  /** Touches réservées par l'interface, qu'on refuse d'affecter à une dimension. */
  const TOUCHES_RESERVEES = new Set(['escape', 'tab', 'enter', ' ', 'f5']);

  let reglages = $state({ ...REGLAGES_DEFAUT });
  let ecran = $state('accueil'); // accueil | jeu | bilan
  // $state.raw et non $state : un objet $state profond est un Proxy, et
  // IndexedDB refuse de sérialiser un Proxy (« could not be cloned »).
  // Seule la réaffectation de « partie » doit déclencher un rendu ; les
  // réponses sont reflétées par « signalees », qui reste réactif.
  let partie = $state.raw(null);
  let index = $state(-1);
  let visible = $state(false);
  let signalees = $state({});
  /**
   * Retour visuel par dimension pendant la partie :
   * 'neutre' | 'reussite' | 'echec' | 'oubli'.
   * Reprend les quatre états de quad-box (blank / success / failure /
   * late-failure), y compris l'oubli signalé en fin d'épreuve.
   */
  let retours = $state({});
  let minuteurOubli = null;
  let bilan = $state(null);
  let historique = $state([]);
  let compteAvant = $state(0);
  let sombre = $state(false);
  let debutSession = 0;
  let minuteurs = [];
  /** Dimension dont on attend la nouvelle touche, ou null. */
  let captureTouche = $state(null);
  let messageTouche = $state('');
  let erreurHistorique = $state('');

  // --- Réglages mémorisés -------------------------------------------------
  function chargerReglages() {
    try {
      const brut = localStorage.getItem(CLE_REGLAGES);
      if (brut) {
        const enregistre = JSON.parse(brut);
        // Fusion en profondeur pour « touches » : une dimension ajoutée plus
        // tard doit garder sa touche par défaut plutôt que de disparaître.
        reglages = {
          ...REGLAGES_DEFAUT,
          ...enregistre,
          touches: { ...TOUCHES_DEFAUT, ...(enregistre.touches ?? {}) },
          progression: { ...PROGRESSION_DEFAUT, ...(enregistre.progression ?? {}) },
        };
      }
    } catch {
      /* navigation privée */
    }
  }

  function memoriserReglages() {
    try {
      localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglages));
    } catch {
      /* navigation privée */
    }
  }

  function observerTheme() {
    const lire = () => (sombre = document.documentElement.getAttribute('data-theme') === 'sombre');
    lire();
    const observateur = new MutationObserver(lire);
    observateur.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observateur.disconnect();
  }

  let arreterObservation = () => {};

  onMount(() => {
    chargerReglages();
    arreterObservation = observerTheme();
    lecteurAudio.precharger();
    void rafraichirHistorique();
    return () => arreterObservation();
  });

  async function rafraichirHistorique() {
    try {
      const sessions = await toutesLesSessionsNBack();
      historique = sessions
        .filter((session) => session.statut !== 'jalon')
        .sort((a, b) => b.le.localeCompare(a.le))
        .slice(0, 8);
    } catch (erreur) {
      // Un échec de lecture ne doit pas rester muet : c'est ce qui avait rendu
      // invisible une panne générale de la base sur cette page.
      erreurHistorique = erreur instanceof Error ? erreur.message : String(erreur);
      historique = [];
    }
  }

  // --- Déroulement de la partie ------------------------------------------
  function nettoyerMinuteurs() {
    for (const m of minuteurs) clearTimeout(m);
    minuteurs = [];
    if (minuteurOubli !== null) {
      clearTimeout(minuteurOubli);
      minuteurOubli = null;
    }
  }

  const retoursNeutres = () =>
    Object.fromEntries(reglages.dimensions.map((cle) => [cle, 'neutre']));

  /**
   * Fin d'une épreuve : les correspondances qui n'ont pas été signalées
   * apparaissent en « oubli ». Comme dans quad-box, ce retour déborde
   * volontairement sur le début de l'épreuve suivante, le temps d'être vu,
   * puis s'efface au bout d'une demi-seconde.
   */
  function detecterOublis(indiceEpreuve) {
    if (!reglages.retourImmediat || !partie || indiceEpreuve < 0) return;
    const epreuve = partie.epreuves[indiceEpreuve];
    if (!epreuve) return;

    const suivants = {};
    let oubliDetecte = false;
    for (const cle of partie.meta.dimensions) {
      const manquee = epreuve.correspondances.includes(cle) && !signalees[cle];
      suivants[cle] = manquee ? 'oubli' : 'neutre';
      if (manquee) oubliDetecte = true;
    }
    retours = suivants;

    if (!oubliDetecte) return;
    if (minuteurOubli !== null) clearTimeout(minuteurOubli);
    minuteurOubli = window.setTimeout(() => {
      retours = Object.fromEntries(
        Object.entries(retours).map(([cle, etat]) => [cle, etat === 'oubli' ? 'neutre' : etat]),
      );
      minuteurOubli = null;
    }, 500);
  }

  function planifier(fn, delai) {
    minuteurs.push(setTimeout(fn, delai));
  }

  function commencer() {
    if (reglages.dimensions.length === 0) return;
    // Indispensable pour le redémarrage en cours de partie : sans cela, les
    // minuteurs de la session abandonnée continueraient de faire défiler les
    // épreuves de la nouvelle.
    nettoyerMinuteurs();
    memoriserReglages();

    // Le déverrouillage audio part avec le geste de l'utilisateur — condition
    // des navigateurs mobiles — mais on ne l'attend pas : la promesse peut
    // mettre un temps indéterminé à se résoudre, et la partie resterait alors
    // figée sur un écran inerte après le clic. Le premier son n'intervient
    // qu'une seconde plus tard, au lancement de la première épreuve.
    void lecteurAudio.debloquer();

    partie = genererPartie({
      n: reglages.n,
      epreuves: reglages.epreuves,
      dimensions: [...reglages.dimensions],
      grille3D: reglages.grille3D,
      tauxCorrespondance: reglages.tauxCorrespondance,
      interference: reglages.interference,
      sourceMotif: reglages.sourceMotif,
    });
    index = -1;
    signalees = {};
    retours = retoursNeutres();
    bilan = null;
    debutSession = Date.now();
    ecran = 'jeu';
    // Une seconde de battement avant la première épreuve : on ne doit pas
    // rater un stimulus parce que l'écran vient de changer.
    planifier(epreuveSuivante, 1000);
  }

  function epreuveSuivante() {
    // L'épreuve qui s'achève livre d'abord son verdict sur les oublis.
    detecterOublis(index);

    index += 1;
    if (!partie || index >= partie.epreuves.length) {
      void terminer('terminee');
      return;
    }

    signalees = {};
    visible = true;
    const epreuve = partie.epreuves[index];
    if (reglages.dimensions.includes('son')) lecteurAudio.jouer(epreuve.son);

    // Le stimulus reste affiché la moitié du temps d'épreuve : l'intervalle
    // vide oblige à mémoriser plutôt qu'à comparer visuellement.
    planifier(() => (visible = false), reglages.dureeEpreuve * 0.5);
    planifier(epreuveSuivante, reglages.dureeEpreuve);
  }

  function signaler(dimension) {
    if (ecran !== 'jeu' || index < 0 || !partie) return;
    if (!partie.meta.dimensions.includes(dimension)) return;
    if (signalees[dimension]) return; // une seule réponse par épreuve

    signalees = { ...signalees, [dimension]: true };
    partie.epreuves[index].reponses[dimension] = true;

    // Les n premières épreuves n'ont pas de point de comparaison : y répondre
    // ne compte pas dans le score, le retour reste donc neutre.
    if (!reglages.retourImmediat || index < partie.meta.n) return;
    const juste = partie.epreuves[index].correspondances.includes(dimension);
    retours = { ...retours, [dimension]: juste ? 'reussite' : 'echec' };
  }

  async function terminer(cause) {
    nettoyerMinuteurs();
    visible = false;
    if (!partie) return;

    const score = calculerScore(partie);
    const secondes = Math.round((Date.now() - debutSession) / 1000);
    const titre = titrePartie(partie.meta.dimensions);
    bilan = { ...score, cause, n: partie.meta.n, decision: 'stable', suivant: partie.meta.n };
    ecran = 'bilan';

    // Une partie abandonnée n'est pas enregistrée : elle fausserait
    // l'historique et la progression de niveau.
    if (cause !== 'terminee') return;

    await ajouterSessionNBack({
      le: new Date().toISOString(),
      titre,
      statut: 'terminee',
      n: partie.meta.n,
      dimensions: [...partie.meta.dimensions],
      nombreEpreuves: partie.meta.nombreEpreuves,
      taux: score.taux,
      reperees: score.reperees,
      aReperer: score.aReperer,
      erreurs: score.erreurs,
      secondes,
    });

    const gain = await gagnerXp(xpNBack(partie.meta.n, score.taux), { secondes: 0 });
    compteAvant = gain.xpGagne;
    for (const badge of gain.nouveauxBadges) notifier(`${badge.icone} Succès : ${badge.nom}`, 'badge');
    if (gain.monteeDeNiveau) notifier(`🎉 Niveau ${gain.niveau.niveau} !`, 'succes');

    // Progression automatique : on relit l'historique, la partie qui vient
    // d'être jouée comprise, puis on pose un jalon si le niveau change — sans
    // lui, les mêmes parties seraient recomptées à la session suivante.
    const sessions = (await toutesLesSessionsNBack()).sort((a, b) => b.le.localeCompare(a.le));
    const resultat = progressionAutomatique(
      { titre, n: partie.meta.n, taux: score.taux },
      sessions,
      reglages.progression,
    );

    bilan = { ...bilan, decision: resultat.decision, suivant: resultat.n };

    if (resultat.decision !== 'stable') {
      await ajouterSessionNBack({
        le: new Date().toISOString(),
        titre,
        statut: 'jalon',
        n: partie.meta.n,
        dimensions: [...partie.meta.dimensions],
        nombreEpreuves: partie.meta.nombreEpreuves,
        taux: score.taux,
        reperees: score.reperees,
        aReperer: score.aReperer,
        erreurs: score.erreurs,
        secondes: 0,
      });
      reglages.n = resultat.n;
      notifier(
        resultat.decision === 'montee'
          ? `⬆ Niveau n = ${resultat.n}`
          : `⬇ Niveau n = ${resultat.n}`,
        resultat.decision === 'montee' ? 'succes' : 'info',
      );
    }

    memoriserReglages();
    await rafraichirHistorique();
  }

  function abandonner() {
    void terminer('abandonnee');
  }

  /**
   * Abandonne la partie en cours et en relance aussitôt une autre avec les
   * mêmes réglages, sans repasser par l'écran de bilan ni par les réglages.
   * La séquence de stimuli, elle, est régénérée : il s'agit bien d'une
   * nouvelle partie, pas d'une reprise.
   *
   * La partie abandonnée n'est pas enregistrée, comme tout abandon.
   */
  function recommencer() {
    commencer();
  }

  function retourAccueil() {
    nettoyerMinuteurs();
    partie = null;
    ecran = 'accueil';
  }

  /** Libellé lisible d'une touche (pour l'affichage). */
  function libelleTouche(touche) {
    if (!touche) return '—';
    if (touche === ' ') return 'Espace';
    return touche.length === 1 ? touche.toUpperCase() : touche;
  }

  function demarrerCapture(cle) {
    captureTouche = captureTouche === cle ? null : cle;
    messageTouche = '';
  }

  /**
   * Affecte une touche à une dimension.
   * Si la touche sert déjà à une autre dimension, les deux sont échangées :
   * on ne peut donc jamais se retrouver avec une dimension sans touche.
   */
  function affecterTouche(cle, touche) {
    const normalisee = touche.toLowerCase();
    if (TOUCHES_RESERVEES.has(normalisee)) {
      messageTouche = `« ${libelleTouche(touche)} » est réservée par l'interface.`;
      return;
    }

    const occupant = Object.entries(reglages.touches).find(
      ([autre, t]) => autre !== cle && t === normalisee,
    );
    const ancienne = reglages.touches[cle];

    const touches = { ...reglages.touches, [cle]: normalisee };
    if (occupant) touches[occupant[0]] = ancienne;
    reglages.touches = touches;

    messageTouche = occupant
      ? `Touches échangées avec « ${DIMENSIONS.find((d) => d.cle === occupant[0])?.libelle} ».`
      : '';
    captureTouche = null;
    memoriserReglages();
  }

  function reinitialiserTouches() {
    reglages.touches = { ...TOUCHES_DEFAUT };
    captureTouche = null;
    messageTouche = 'Touches remises par défaut.';
    memoriserReglages();
  }

  /**
   * L'élément focalisé fait-il déjà quelque chose de cette touche ?
   * Un bouton ou un lien réagit à Entrée et Espace, une zone de saisie à
   * Entrée : on ne leur vole pas la touche. Un curseur ou une case à cocher
   * ignore Entrée, le raccourci peut donc s'appliquer — sans quoi régler un
   * curseur suffirait à désactiver le lancement au clavier.
   */
  function accapareLaTouche(cible, touche) {
    if (!(cible instanceof HTMLElement)) return false;
    if (cible.isContentEditable) return true;

    const balise = cible.tagName;
    if (balise === 'BUTTON' || balise === 'A' || balise === 'SELECT' || balise === 'TEXTAREA') return true;

    if (balise === 'INPUT') {
      const type = (cible.getAttribute('type') ?? 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return touche === ' ';
      if (type === 'range') return false;
      return true; // champs de saisie textuels
    }
    return false;
  }

  /**
   * Active ou désactive une dimension, en respectant les exclusions :
   * le motif porte déjà forme et couleur, il ne peut pas coexister avec elles
   * (même règle que dans quad-box).
   */
  function basculerDimension(cle) {
    if (reglages.dimensions.includes(cle)) {
      reglages.dimensions = reglages.dimensions.filter((d) => d !== cle);
      return;
    }
    const exclues = EXCLUSIONS[cle] ?? [];
    reglages.dimensions = [...reglages.dimensions.filter((d) => !exclues.includes(d)), cle];
  }

  function surTouche(evenement) {
    // Capture d'une nouvelle touche : prioritaire sur tout le reste.
    if (captureTouche) {
      evenement.preventDefault();
      if (evenement.key === 'Escape') {
        captureTouche = null;
        messageTouche = '';
        return;
      }
      affecterTouche(captureTouche, evenement.key);
      return;
    }

    if (ecran === 'jeu') {
      if (evenement.key === 'Escape') {
        abandonner();
        return;
      }
      const frappe = evenement.key.toLowerCase();
      const cle = Object.keys(reglages.touches).find((d) => reglages.touches[d] === frappe);
      if (cle) {
        evenement.preventDefault();
        signaler(cle);
      }
      return;
    }

    // Hors jeu : Entrée ou Espace lancent la session, pour rester au clavier.
    if (evenement.key !== 'Enter' && evenement.key !== ' ') return;
    if (accapareLaTouche(evenement.target, evenement.key)) return;
    evenement.preventDefault();
    void commencer();
  }

  onDestroy(nettoyerMinuteurs);

  /**
   * Couleurs des retours, reprises telles quelles de quad-box (app.css).
   * La couleur de texte est choisie pour rester lisible sur chaque fond.
   */
  const COULEURS_RETOUR = {
    reussite: { clair: ['#93C82E', '#14290a'], sombre: ['#386D38', '#f8fafc'] },
    echec: { clair: ['#EE3527', '#ffffff'], sombre: ['#9F2323', '#f8fafc'] },
    oubli: { clair: ['#F49F31', '#2a1a05'], sombre: ['#a6712c', '#f8fafc'] },
  };

  /** Style en ligne d'un bouton de réponse selon son état. */
  function styleRetour(cle) {
    const etat = retours[cle];
    const palette = COULEURS_RETOUR[etat];
    if (!palette) return '';
    const [fond, texte] = palette[sombre ? 'sombre' : 'clair'];
    return `background-color:${fond};color:${texte};`;
  }

  /** Libellé annoncé aux lecteurs d'écran quand le retour change. */
  const LIBELLES_RETOUR = {
    reussite: 'correct',
    echec: 'incorrect',
    oubli: 'correspondance manquée',
  };

  const annonceRetour = $derived(
    Object.entries(retours)
      .filter(([, etat]) => etat !== 'neutre')
      .map(([cle, etat]) => `${DIMENSIONS.find((d) => d.cle === cle)?.libelle} : ${LIBELLES_RETOUR[etat]}`)
      .join(', '),
  );

  const dimensionsActives = $derived(DIMENSIONS.filter((d) => reglages.dimensions.includes(d.cle)));
  const progression = $derived(
    partie && index >= 0 ? Math.min(100, Math.round((index / partie.epreuves.length) * 100)) : 0,
  );
  const titreMode = $derived(nomMode(titrePartie(reglages.dimensions)));
</script>

<svelte:window on:keydown={surTouche} />

{#if ecran === 'accueil'}
  <div class="space-y-6">
    <section class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Réglages de la session</h2>

      <div class="grid gap-5 sm:grid-cols-2">
        <div>
          <label for="niveau-n" class="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Profondeur : <strong>n = {reglages.n}</strong>
          </label>
          <input id="niveau-n" type="range" min="1" max="9" bind:value={reglages.n} class="w-full accent-indigo-600" />
          <p class="mt-1 text-xs text-slate-400">
            Il faut comparer chaque stimulus à celui de {reglages.n} épreuve{reglages.n > 1 ? 's' : ''} plus tôt.
          </p>
        </div>

        <div>
          <label for="nb-epreuves" class="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Épreuves : <strong>{reglages.epreuves}</strong>
          </label>
          <input id="nb-epreuves" type="range" min="10" max="60" step="2" bind:value={reglages.epreuves} class="w-full accent-indigo-600" />
          <p class="mt-1 text-xs text-slate-400">
            Durée estimée : {Math.round((reglages.epreuves * reglages.dureeEpreuve) / 1000 / 6) / 10} min
          </p>
        </div>

        <div>
          <label for="duree" class="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Rythme : <strong>{(reglages.dureeEpreuve / 1000).toFixed(1)} s</strong> par épreuve
          </label>
          <input id="duree" type="range" min="1500" max="5000" step="250" bind:value={reglages.dureeEpreuve} class="w-full accent-indigo-600" />
        </div>

        <div>
          <label for="taux-corr" class="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Correspondances visées : <strong>{reglages.tauxCorrespondance} %</strong>
          </label>
          <input id="taux-corr" type="range" min="10" max="50" step="5" bind:value={reglages.tauxCorrespondance} class="w-full accent-indigo-600" />
        </div>

        <div>
          <label for="interf" class="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Interférence : <strong>{reglages.interference} %</strong>
          </label>
          <input id="interf" type="range" min="0" max="60" step="5" bind:value={reglages.interference} class="w-full accent-indigo-600" />
          <p class="mt-1 text-xs text-slate-400">
            Fréquence des leurres : un stimulus proche d'une correspondance, mais décalé d'un rang.
          </p>
        </div>

        <div class="flex flex-col justify-end gap-2">
          <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" bind:checked={reglages.grille3D} class="h-4 w-4 rounded border-slate-300 text-indigo-600" />
            Grille 3D en rotation (27 positions)
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" bind:checked={reglages.retourImmediat} class="h-4 w-4 rounded border-slate-300 text-indigo-600" />
            Retour immédiat sur chaque réponse
          </label>
        </div>
      </div>

      <fieldset class="mt-5">
        <legend class="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          Dimensions suivies — mode <strong>{titreMode}</strong>
        </legend>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {#each DIMENSIONS as dimension (dimension.cle)}
            {@const actif = reglages.dimensions.includes(dimension.cle)}
            {@const enCapture = captureTouche === dimension.cle}
            <!--
              Deux commandes distinctes : activer la dimension, et changer sa
              touche. Elles ne peuvent pas être imbriquées dans un même bouton.
            -->
            <div
              class="rounded-xl border p-3 transition {actif
                ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/60'
                : 'border-slate-200 bg-white opacity-60 dark:border-slate-700 dark:bg-slate-900'}"
            >
              <button
                type="button"
                onclick={() => basculerDimension(dimension.cle)}
                aria-pressed={actif}
                class="w-full text-left"
              >
                <span class="block text-sm font-medium text-slate-900 dark:text-white">
                  {actif ? '☑' : '☐'} {dimension.libelle}
                </span>
                <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {dimension.description}
                </span>
              </button>

              <button
                type="button"
                onclick={() => demarrerCapture(dimension.cle)}
                aria-label="Changer la touche de « {dimension.libelle} » (actuellement {libelleTouche(reglages.touches[dimension.cle])})"
                class="mt-2 w-full rounded-lg border px-2 py-1.5 text-xs transition {enCapture
                  ? 'animate-pulse border-indigo-500 bg-indigo-600 text-white'
                  : 'border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'}"
              >
                {#if enCapture}
                  Appuyez sur une touche…
                {:else}
                  Touche : <kbd class="font-semibold">{libelleTouche(reglages.touches[dimension.cle])}</kbd>
                {/if}
              </button>
            </div>
          {/each}
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onclick={reinitialiserTouches}
            class="text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Rétablir les touches par défaut
          </button>
          {#if messageTouche}
            <span class="text-xs text-indigo-600 dark:text-indigo-400">{messageTouche}</span>
          {/if}
        </div>

        {#if reglages.dimensions.length === 0}
          <p class="mt-2 text-sm text-red-600 dark:text-red-400">Activez au moins une dimension.</p>
        {/if}

        {#if reglages.dimensions.includes('motif')}
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <label for="source-motif" class="text-sm text-slate-600 dark:text-slate-300">Source des motifs :</label>
            <select
              id="source-motif"
              bind:value={reglages.sourceMotif}
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {#each SOURCES_MOTIF as source (source.cle)}
                <option value={source.cle}>{source.libelle}</option>
              {/each}
            </select>
            <span class="text-xs text-slate-400">Le motif remplace la couleur et la forme.</span>
          </div>
        {/if}
      </fieldset>

      <fieldset class="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <legend class="px-1 text-sm font-medium text-slate-600 dark:text-slate-300">
          Progression automatique du niveau
        </legend>

        <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" bind:checked={reglages.progression.active} class="h-4 w-4 rounded border-slate-300 text-indigo-600" />
          Ajuster n automatiquement d'après les parties récentes
        </label>

        {#if reglages.progression.active}
          <div class="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label for="seuil-montee" class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Monter après <strong>{reglages.progression.partiesMontee}</strong> partie(s) à
                <strong>{reglages.progression.seuilMontee} %</strong> ou plus
              </label>
              <input id="seuil-montee" type="range" min="50" max="100" step="5" bind:value={reglages.progression.seuilMontee} class="w-full accent-emerald-600" />
              <input aria-label="Nombre de parties requises pour monter" type="range" min="1" max="5" bind:value={reglages.progression.partiesMontee} class="mt-1 w-full accent-emerald-600" />
            </div>
            <div>
              <label for="seuil-descente" class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Descendre après <strong>{reglages.progression.partiesDescente}</strong> partie(s) sous
                <strong>{reglages.progression.seuilDescente} %</strong>
              </label>
              <input id="seuil-descente" type="range" min="10" max="80" step="5" bind:value={reglages.progression.seuilDescente} class="w-full accent-amber-600" />
              <input aria-label="Nombre de parties requises pour descendre" type="range" min="1" max="5" bind:value={reglages.progression.partiesDescente} class="mt-1 w-full accent-amber-600" />
            </div>
          </div>
          <p class="mt-2 text-xs text-slate-400">
            Seules les parties des 48 dernières heures, dans le même mode et au même niveau,
            sont comparées ; un changement de niveau remet le compteur à zéro.
          </p>
        {/if}
      </fieldset>

      <button
        onclick={commencer}
        disabled={reglages.dimensions.length === 0}
        class="mt-6 w-full rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
      >
        Commencer la session
      </button>
      <p class="mt-2 text-xs text-slate-400">
        Raccourci : <kbd class="rounded border border-slate-300 px-1 dark:border-slate-600">Entrée</kbd>
        lance la session, <kbd class="rounded border border-slate-300 px-1 dark:border-slate-600">Échap</kbd> l'interrompt.
      </p>
    </section>

    {#if erreurHistorique}
      <p class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
        Historique indisponible : {erreurHistorique}
      </p>
    {/if}

    {#if historique.length}
      <section>
        <h2 class="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Dernières sessions</h2>
        <div class="space-y-2">
          {#each historique as session (session.id)}
            <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
              <span class="font-medium text-slate-800 dark:text-slate-100">
                n = {session.n}
                <span class="ml-1 font-normal text-slate-400">{nomMode(session.titre)}</span>
              </span>
              <span class="text-xs text-slate-400">
                {new Date(session.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
              <span
                class="font-semibold {session.taux * 100 >= reglages.progression.seuilMontee
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : session.taux * 100 >= reglages.progression.seuilDescente
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'}"
              >
                {Math.round(session.taux * 100)} %
              </span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{:else if ecran === 'jeu'}
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <button
        onclick={abandonner}
        class="shrink-0 text-sm text-slate-500 hover:underline dark:text-slate-400"
      >
        ← Arrêter
      </button>
      <button
        onclick={recommencer}
        title="Abandonner et relancer une partie avec les mêmes réglages"
        class="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        ↻ <span class="hidden sm:inline">Recommencer</span>
      </button>
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div class="h-full rounded-full bg-indigo-500 transition-all duration-200" style="width: {progression}%"></div>
      </div>
      <span class="text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400">
        {Math.max(0, index + 1)}/{partie?.epreuves.length ?? 0}
      </span>
      {#if partie && index < 0}
        <!-- Seconde de battement avant la première épreuve : sans indication,
             ce temps mort passe pour un blocage. -->
        <span class="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
          préparez-vous…
        </span>
      {:else if partie && index < partie.meta.n}
        <!--
          Les n premières épreuves servent d'amorçage : il n'y a rien à quoi
          les comparer. Comme dans quad-box, aucune réponse n'y est comptée —
          autant le dire, sinon l'absence de verdict passe pour une panne.
        -->
        <span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          amorçage
        </span>
      {/if}
      <span class="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
        n = {partie?.meta.n}
      </span>
    </div>

    <!--
      Les caractéristiques d'affichage viennent de la PARTIE en cours, pas des
      réglages : ceux-ci peuvent changer pendant qu'une partie se joue, et le
      vivier de motifs a été tiré au lancement. Dessiner des graines d'art
      génératif avec le moteur Voronoï ne produirait rien.
    -->
    <Grille
      epreuve={index >= 0 ? partie?.epreuves[index] : null}
      {visible}
      grille3D={partie?.meta.grille3D ?? reglages.grille3D}
      {sombre}
      dimensions={partie?.meta.dimensions ?? reglages.dimensions}
      sourceMotif={partie?.meta.sourceMotif ?? reglages.sourceMotif}
    />

    <div class="grid gap-2" style="grid-template-columns: repeat({dimensionsActives.length}, minmax(0, 1fr))">
      {#each dimensionsActives as dimension (dimension.cle)}
        {@const etat = retours[dimension.cle] ?? 'neutre'}
        <button
          type="button"
          onclick={() => signaler(dimension.cle)}
          style={styleRetour(dimension.cle)}
          class="rounded-xl px-2 py-4 text-sm font-medium transition duration-150 {etat !== 'neutre'
            ? ''
            : signalees[dimension.cle]
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}"
        >
          {dimension.libelle}
          <kbd class="mt-1 block text-[11px] font-normal opacity-60">
            {etat === 'reussite' ? '✓' : etat === 'echec' ? '✗' : etat === 'oubli' ? '⌛' : libelleTouche(reglages.touches[dimension.cle])}
          </kbd>
        </button>
      {/each}
    </div>
    <p class="sr-only" aria-live="polite">{annonceRetour}</p>

    {#if reglages.retourImmediat}
      <p class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-slate-400">
        <span><span class="inline-block h-2.5 w-2.5 rounded-sm align-middle" style="background:#93C82E"></span> correct</span>
        <span><span class="inline-block h-2.5 w-2.5 rounded-sm align-middle" style="background:#EE3527"></span> incorrect</span>
        <span><span class="inline-block h-2.5 w-2.5 rounded-sm align-middle" style="background:#F49F31"></span> correspondance manquée</span>
      </p>
    {/if}

    <p class="text-center text-xs text-slate-400">
      Signalez une correspondance avec l'épreuve {partie?.meta.n} rangs plus tôt.
      « ↻ » relance une partie identique, Échap arrête.
    </p>
  </div>
{:else if ecran === 'bilan'}
  <div class="py-6 text-center">
    {#if bilan.cause !== 'terminee'}
      <p class="text-4xl">⏸️</p>
      <h2 class="mt-3 text-xl font-bold text-slate-900 dark:text-white">Session interrompue</h2>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Une session abandonnée n'est pas enregistrée.
      </p>
    {:else}
      <p class="text-5xl">
        {bilan.taux * 100 >= reglages.progression.seuilMontee
          ? '🎯'
          : bilan.taux * 100 >= reglages.progression.seuilDescente
            ? '👍'
            : '💪'}
      </p>
      <h2 class="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
        {Math.round(bilan.taux * 100)} % — n = {bilan.n}
      </h2>
      <p class="mt-1 text-slate-500 dark:text-slate-400">
        {bilan.reperees}/{bilan.aReperer} correspondance(s) repérée(s) · {bilan.erreurs} erreur(s) · +{compteAvant} XP
      </p>

      <div class="mx-auto mt-6 max-w-md space-y-2 text-left">
        {#each Object.entries(bilan.parDimension) as [cle, detail] (cle)}
          {@const libelle = DIMENSIONS.find((d) => d.cle === cle)?.libelle ?? cle}
          <div class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-800 dark:text-slate-100">{libelle}</span>
              <span class="font-semibold text-slate-500 dark:text-slate-400">{Math.round(detail.taux * 100)} %</span>
            </div>
            <p class="mt-0.5 text-xs text-slate-400">
              {detail.vraisPositifs} repérée(s) · {detail.oublis} oubli(s) · {detail.fauxPositifs} fausse(s) alerte(s)
            </p>
          </div>
        {/each}
      </div>

      {#if bilan.decision !== 'stable'}
        <p class="mt-5 text-sm font-medium {bilan.decision === 'montee' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
          {bilan.decision === 'montee' ? '↑' : '↓'} Prochaine session en n = {bilan.suivant}
        </p>
      {:else if reglages.progression.active}
        <p class="mt-5 text-xs text-slate-400">Niveau inchangé : n = {bilan.n}</p>
      {/if}
    {/if}

    <div class="mt-8 flex flex-wrap justify-center gap-3">
      <button onclick={commencer} class="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-700">
        Nouvelle session
      </button>
      <button onclick={retourAccueil} class="rounded-lg border border-slate-300 px-5 py-2.5 font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
        Réglages
      </button>
    </div>
  </div>
{/if}
