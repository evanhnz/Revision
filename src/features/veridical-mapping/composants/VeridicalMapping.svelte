<script lang="ts">
  /**
   * La session de Veridical Mapping.
   *
   * Un essai montre une référence sur une dimension et deux candidats sur une
   * autre ; un seul est au même niveau relatif. L'escalier adaptatif resserre
   * l'écart entre les deux candidats après deux réussites et l'élargit après une
   * erreur, jusqu'à cerner le seuil de discrimination de cette paire.
   *
   * **La charge n'ajoute pas de candidats mais des sous-essais.** Ajouter des
   * candidats changerait le niveau du hasard, donc le point de convergence de
   * l'escalier, et rendrait les seuils incomparables d'une charge à l'autre.
   * Plusieurs sous-essais au même écart augmentent ce qu'il faut tenir à la fois
   * sans toucher à la mesure : chacun nourrit l'escalier pour son compte.
   *
   * L'état de l'escalier est enregistré après **chaque** essai. Une procédure
   * adaptative se poursuit d'une session à l'autre, et une session abandonnée en
   * cours de route ne doit pas faire perdre la descente déjà faite.
   */
  import {
    ajouterSessionVeridical,
    ecrireSeuilVeridical,
    tousLesSeuilsVeridical,
    toutesLesSessionsVeridical,
    type SeuilVeridical,
    type SessionVeridical,
  } from '../../../lib/db';
  import { gagnerXp, xpVeridical } from '../../../lib/gamification';
  import { debloquer, disponible } from '../audio';
  import { NOMS_FAMILLES, type Famille } from '../dimensions';
  import { escalierNeuf, repondre, seuil as seuilDe, statut as statutDe } from '../escalier';
  import { idArete, type Arete } from '../hub';
  import {
    LONGUEURS,
    REGLAGES_PAR_DEFAUT,
    chargeAdmise,
    tirerEssai,
    vivierDAretes,
    type Essai,
    type Reglages,
  } from '../session';
  import Stimulus from './Stimulus.svelte';
  import { superposables } from '../stimulus';
  import TableauDeBord from './TableauDeBord.svelte';

  type Etape = 'accueil' | 'essai' | 'bilan';

  let chargement = $state(true);
  let etape = $state<Etape>('accueil');
  let reglages = $state<Reglages>({ ...REGLAGES_PAR_DEFAUT });
  let seuils = $state<Record<string, SeuilVeridical>>({});
  let sessions = $state<SessionVeridical[]>([]);
  let tableauOuvert = $state(false);
  let sonPret = $state(false);

  let vivier: Arete[] = [];
  let essai = $state<Essai | null>(null);
  let choix = $state<(number | null)[]>([]);
  let retour = $state<'attente' | 'corrige'>('attente');
  let faits = $state(0);
  let reussis = $state(0);
  let convergences = $state<string[]>([]);
  let pairesVues = new Set<string>();
  let debut = 0;
  let xpGagne = $state(0);

  const hasard = {
    reel: () => Math.random(),
    entier: (borne: number) => Math.floor(Math.random() * borne),
  };

  async function charger() {
    try {
      const [lus, journal] = await Promise.all([tousLesSeuilsVeridical(), toutesLesSessionsVeridical()]);
      seuils = Object.fromEntries(lus.map((s) => [s.id, s]));
      sessions = journal.slice().sort((a, b) => b.le.localeCompare(a.le));
    } catch {
      seuils = {};
      sessions = [];
    }
    chargement = false;
  }
  charger();

  /**
   * La clef d'un seuil : l'arête, **et la tâche**.
   *
   * C'est une condition de validité, non un raffinement. Un seuil mesuré sur la
   * tâche « un couple » n'est pas la même grandeur que celui de la tâche de
   * base : il incorpore le coût de tenir deux axes à la fois. Les écrire sous la
   * même clef ferait poursuivre un escalier avec les réponses d'un autre, et les
   * deux mesures seraient perdues.
   *
   * La tâche de base garde la clef nue, de sorte que les seuils déjà mesurés
   * restent les leurs : aucune migration de données n'est nécessaire.
   */
  function clefSeuil(arete: Arete, tache: Reglages['tache'] = reglages.tache): string {
    return tache === 'point' ? arete.id : `${arete.id}|${tache}`;
  }

  /** Le seuil d'une arête, créé à la volée s'il n'existe pas encore. */
  function seuilDArete(arete: Arete): SeuilVeridical {
    const clef = clefSeuil(arete);
    return (
      seuils[clef] ?? {
        id: clef,
        famille: arete.de.famille,
        de: arete.de.id,
        vers: arete.vers.id,
        horsFamille: arete.de.famille !== arete.vers.famille,
        transmodale: arete.transmodale,
        escalier: escalierNeuf(),
        seuil: null,
        statut: 'jamais' as const,
        majLe: new Date().toISOString(),
      }
    );
  }

  /**
   * Essais déjà faits sur une paire, dans les deux sens : poids de l'arbre
   * couvrant, qui fait passer en priorité par les paires les moins mesurées.
   *
   * Le décompte est propre à la **tâche** courante, comme les seuils eux-mêmes :
   * une paire bien couverte sur la tâche de base ne l'est pas sur la tâche « un
   * couple », et la faire passer en dernier reviendrait à ne jamais la mesurer.
   */
  function essaisDeLaPaire(a: string, b: string): number {
    const cle = (de: string, vers: string) =>
      reglages.tache === 'point' ? idArete(de, vers) : `${idArete(de, vers)}|${reglages.tache}`;
    const aller = seuils[cle(a, b)]?.escalier.essais ?? 0;
    const retourr = seuils[cle(b, a)]?.escalier.essais ?? 0;
    return aller + retourr;
  }

  async function commencer() {
    sonPret = disponible() ? await debloquer() : false;
    vivier = vivierDAretes(reglages, essaisDeLaPaire);
    if (!vivier.length) return;
    faits = 0;
    reussis = 0;
    convergences = [];
    pairesVues = new Set();
    xpGagne = 0;
    debut = Date.now();
    etape = 'essai';
    tirerSuivant();
  }

  function tirerSuivant() {
    const arete = vivier[Math.floor(Math.random() * vivier.length)];
    const etat = seuilDArete(arete).escalier;
    essai = tirerEssai(arete, etat.delta, reglages, hasard);
    choix = essai.sousEssais.map(() => null);
    retour = 'attente';
  }

  const toutRepondu = $derived(choix.length > 0 && choix.every((c) => c !== null));

  function choisir(indexSousEssai: number, indexCandidat: number) {
    if (retour === 'corrige') return;
    choix = choix.map((valeur, i) => (i === indexSousEssai ? indexCandidat : valeur));
    // À charge 1, la réponse vaut validation : enchaîner sans clic superflu
    // garde à la tâche le rythme qu'une mesure de seuil demande.
    if (choix.length === 1) valider();
  }

  async function valider() {
    if (!essai || retour === 'corrige' || !toutRepondu) return;
    const courant = essai;
    let etat = seuilDArete(courant.arete).escalier;
    let justes = 0;

    // Chaque sous-essai nourrit l'escalier pour son compte, au même écart : la
    // charge ajoute ce qu'il faut tenir à la fois, pas de la difficulté
    // perceptive.
    courant.sousEssais.forEach((sousEssai, i) => {
      const juste = sousEssai.candidats[choix[i] ?? -1]?.juste === true;
      if (juste) justes += 1;
      etat = repondre(etat, juste);
    });

    const avant = seuilDArete(courant.arete).statut;
    const apres = statutDe(etat);
    const ligne: SeuilVeridical = {
      ...seuilDArete(courant.arete),
      escalier: etat,
      seuil: seuilDe(etat),
      statut: apres,
      majLe: new Date().toISOString(),
    };
    seuils = { ...seuils, [ligne.id]: ligne };
    pairesVues.add(ligne.id);
    if (avant !== 'converge' && apres === 'converge') convergences = [...convergences, ligne.id];

    faits += courant.sousEssais.length;
    reussis += justes;
    retour = 'corrige';

    try {
      await ecrireSeuilVeridical(ligne);
    } catch {
      // Sans stockage, la session reste jouable mais rien ne sera repris.
    }
  }

  async function suivant() {
    if (faits >= reglages.essais) {
      await terminer();
      return;
    }
    tirerSuivant();
  }

  async function terminer() {
    const secondes = Math.round((Date.now() - debut) / 1000);
    const travaillees = [...pairesVues];
    const mesures = travaillees
      .map((id) => seuils[id]?.seuil)
      .filter((valeur): valeur is number => typeof valeur === 'number')
      .sort((a, b) => a - b);
    const median = mesures.length
      ? mesures.length % 2
        ? mesures[(mesures.length - 1) / 2]
        : (mesures[mesures.length / 2 - 1] + mesures[mesures.length / 2]) / 2
      : null;

    etape = 'bilan';
    try {
      await ajouterSessionVeridical({
        le: new Date().toISOString(),
        famille: reglages.famille,
        mode: reglages.mode,
        charge: reglages.charge,
        essais: faits,
        reussis,
        paires: travaillees,
        seuilMedian: median,
        secondes,
      });
      const gain = await gagnerXp(xpVeridical(reussis, convergences.length), {
        reponses: faits,
        bonnes: reussis,
        secondes,
      });
      xpGagne = gain.xpGagne;
      sessions = (await toutesLesSessionsVeridical()).slice().sort((a, b) => b.le.localeCompare(a.le));
    } catch {
      /* navigation privée : le bilan s'affiche, le suivi est perdu */
    }
  }

  const familles: Famille[] = ['prothetique', 'metathetique'];

  /**
   * Ce que les réglages donnent par arête.
   *
   * Un escalier a besoin d'une trentaine d'essais pour produire les huit
   * inversions d'un seuil. Répartir quarante-huit essais sur les douze arêtes
   * d'une famille en laisse quatre chacune : la session serait agréable et ne
   * mesurerait rien. Mieux vaut le dire avant qu'après.
   */
  const repartition = $derived.by(() => {
    const aretes = vivierDAretes(reglages, essaisDeLaPaire).length;
    if (!aretes) return null;
    const parArete = reglages.essais / aretes;
    return { aretes, parArete, suffisant: parArete >= 24 };
  });
  const chargeReelle = $derived(essai ? chargeAdmise(essai.arete, reglages.charge) : reglages.charge);

  /**
   * Les trois tâches, et celles qui sont réellement praticables dans la famille
   * choisie.
   *
   * La tâche modulaire suppose une dimension d'arrivée qui **reboucle**, et la
   * seule qui le fasse — la teinte — est métathétique. Elle est donc indisponible
   * en famille prothétique, sauf si les paires hors famille sont ouvertes. Plutôt
   * que de la proposer et de retomber silencieusement sur la tâche de base, on la
   * désactive : un réglage qui n'a pas l'effet annoncé est pire qu'un réglage
   * absent.
   */
  const taches = $derived.by(() => {
    const vivier = vivierDAretes(reglages, () => 0);
    const versCirculaire = vivier.some((arete) => arete.vers.circulaire);
    const superposable = vivier.some((arete) =>
      vivier.some(
        (autre) =>
          autre.de.id !== arete.de.id &&
          autre.vers.id !== arete.vers.id &&
          superposables(autre.de, arete.de) &&
          superposables(autre.vers, arete.vers),
      ),
    );
    return [
      {
        id: 'point' as const,
        nom: 'Une valeur',
        disponible: true,
        explication:
          'Une valeur sur la dimension de départ, une valeur au même niveau sur celle ' +
          'd’arrivée. C’est la tâche de base, et celle dont les seuils servent de référence.',
      },
      {
        id: 'plan' as const,
        nom: 'Un couple',
        disponible: superposable,
        explication: superposable
          ? 'La référence porte deux valeurs superposées. Le leurre ne se trompe que sur un ' +
            'axe, et vous ne savez pas lequel : il faut tenir les deux. Le hasard reste à 50 %, ' +
            'donc les seuils restent comparables à ceux de la tâche de base.'
          : 'Indisponible : il n’y a pas ici deux paires de dimensions superposables.',
      },
      {
        id: 'modulaire' as const,
        nom: 'Un écart, sur un cercle',
        disponible: versCirculaire,
        explication: versCirculaire
          ? 'La dimension d’arrivée reboucle : elle n’a pas d’origine, et « la même valeur » ' +
            'n’y veut rien dire. On transporte donc un **écart** entre deux références, à un ' +
            'décalage près — c’est la mise en correspondance d’une structure, non d’un point.'
          : 'Indisponible : aucune dimension d’arrivée ne reboucle dans cette famille. La ' +
            'teinte est la seule circulaire, et elle est métathétique.',
      },
    ];
  });

  const tacheCourante = $derived(taches.find((t) => t.id === reglages.tache));

  // Un réglage devenu indisponible après un changement de famille est ramené à la
  // tâche de base, plutôt que de rester sélectionné sans effet.
  $effect(() => {
    if (!taches.find((t) => t.id === reglages.tache)?.disponible) reglages.tache = 'point';
  });
</script>

{#if chargement}
  <p class="py-16 text-center text-sm text-slate-400">Lecture de vos seuils…</p>
{:else if etape === 'accueil'}
  <section class="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <h2 class="font-semibold text-slate-900 dark:text-white">Régler la session</h2>
      <button
        type="button"
        onclick={() => (tableauOuvert = !tableauOuvert)}
        class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700
          hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200"
      >{tableauOuvert ? 'Masquer le tableau de bord' : 'Tableau de bord'}</button>
    </div>

    {#if tableauOuvert}
      <TableauDeBord {seuils} {sessions} {essaisDeLaPaire} />
    {/if}

    <fieldset class="mt-5">
      <legend class="text-sm font-medium text-slate-700 dark:text-slate-200">Famille de dimensions</legend>
      <div class="mt-2 space-y-2">
        {#each familles as famille (famille)}
          <label class="flex cursor-pointer items-start gap-3 rounded-lg border p-3
            {reglages.famille === famille
              ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40'
              : 'border-slate-200 dark:border-slate-800'}">
            <input type="radio" bind:group={reglages.famille} value={famille} class="mt-1" />
            <span class="min-w-0">
              <span class="block text-sm font-medium text-slate-900 dark:text-white">
                {NOMS_FAMILLES[famille].nom}
              </span>
              <span class="block text-xs text-slate-500 dark:text-slate-400">
                {NOMS_FAMILLES[famille].resume}
              </span>
            </span>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="mt-4">
      <legend class="text-sm font-medium text-slate-700 dark:text-slate-200">Tâche</legend>
      <div class="mt-2 flex flex-wrap gap-2">
        {#each taches as tache (tache.id)}
          <button
            type="button"
            disabled={!tache.disponible}
            onclick={() => (reglages.tache = tache.id)}
            class="rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed
              disabled:opacity-40
              {reglages.tache === tache.id
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'}"
          >{tache.nom}</button>
        {/each}
      </div>
      <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {tacheCourante?.explication}
      </p>
    </fieldset>

    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <fieldset>
        <legend class="text-sm font-medium text-slate-700 dark:text-slate-200">Parcours</legend>
        <div class="mt-2 flex flex-wrap gap-2">
          {#each [['squelette', 'Arbre couvrant'], ['exhaustif', 'Toutes les paires']] as [valeur, nom] (valeur)}
            <button
              type="button"
              onclick={() => (reglages.mode = valeur as Reglages['mode'])}
              class="rounded-lg border px-3 py-2 text-sm font-medium
                {reglages.mode === valeur
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'}"
            >{nom}</button>
          {/each}
        </div>
      </fieldset>

      <fieldset>
        <legend class="text-sm font-medium text-slate-700 dark:text-slate-200">Nombre d'essais</legend>
        <div class="mt-2 flex gap-2">
          {#each LONGUEURS as n (n)}
            <button
              type="button"
              onclick={() => (reglages.essais = n)}
              class="rounded-lg border px-3 py-2 text-sm font-medium
                {reglages.essais === n
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'}"
            >{n}</button>
          {/each}
        </div>
      </fieldset>
    </div>

    <fieldset class="mt-4">
      <legend class="text-sm font-medium text-slate-700 dark:text-slate-200">Charge</legend>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Nombre de correspondances à tenir sur le même écran. Elle ne change pas la mesure du seuil,
        et ne s'applique qu'aux paires entièrement visuelles — un son se joue l'un après l'autre.
      </p>
      <div class="mt-2 flex gap-2">
        {#each [1, 2, 3] as n (n)}
          <button
            type="button"
            onclick={() => (reglages.charge = n)}
            class="rounded-lg border px-3 py-2 text-sm font-medium
              {reglages.charge === n
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'}"
          >{n}</button>
        {/each}
      </div>
    </fieldset>

    <fieldset class="mt-4 space-y-2">
      <legend class="text-sm font-medium text-slate-700 dark:text-slate-200">Variantes</legend>
      <label class="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" bind:checked={reglages.bruit} class="mt-1" />
        <span>
          <strong class="font-medium">Bruit de surface</strong> — les candidats portent des couleurs
          parasites, sans rapport avec le niveau. Il faut les ignorer.
        </span>
      </label>
      <label class="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" bind:checked={reglages.partiel} class="mt-1" />
        <span>
          <strong class="font-medium">Référence partielle</strong> — la référence n'est montrée
          qu'à moitié, ou le son coupé avant la fin : il faut compléter avant de comparer.
        </span>
      </label>
      <label class="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" bind:checked={reglages.horsFamille} class="mt-1" />
        <span>
          <strong class="font-medium">Paires hors famille</strong> — relier un « combien » à un
          « où », ce que la règle de Stevens exclut. Elles sont suivies à part au tableau de bord.
        </span>
      </label>
    </fieldset>

    {#if repartition}
      <p class="mt-4 rounded-lg border p-3 text-xs
        {repartition.suffisant
          ? 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'
          : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200'}">
        {repartition.aretes} arête{repartition.aretes > 1 ? 's' : ''} à parcourir, soit environ
        {repartition.parArete.toFixed(0)} essai{repartition.parArete >= 2 ? 's' : ''} chacune.
        {#if repartition.suffisant}
          De quoi faire progresser les escaliers ; un seuil demande une trentaine d'essais par arête,
          cumulés d'une session à l'autre.
        {:else}
          <strong>C'est peu pour mesurer un seuil</strong> — il en faut une trentaine par arête.
          Les escaliers avancent tout de même, puisqu'ils reprennent où ils s'étaient arrêtés, mais
          l'arbre couvrant ou une session plus longue concentreraient mieux les essais.
        {/if}
      </p>
    {/if}

    <button
      type="button"
      onclick={commencer}
      class="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
    >Commencer</button>
  </section>
{:else if etape === 'essai' && essai}
  <section>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
        {essai.arete.de.nom} → {essai.arete.vers.nom}
        {#if essai.arete.transmodale}<span class="text-slate-400"> · transmodale</span>{/if}
      </p>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        {faits} / {reglages.essais} · écart {essai.delta} pas
      </p>
    </div>

    <div class="h-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
      <div class="h-full bg-indigo-500 transition-all" style="width: {(faits / reglages.essais) * 100}%"></div>
    </div>

    {#if essai.arete.vers.modalite === 'auditive' && !sonPret}
      <p class="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800
        dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
        Le son n'a pas pu démarrer sur cet appareil : les paires sonores ne seront pas jouables.
      </p>
    {/if}

    <p class="mt-4 text-sm text-slate-600 dark:text-slate-300">
      {#if essai.tache === 'plan'}
        La référence porte <strong class="font-medium">deux</strong> valeurs à la fois. Lequel
        des deux candidats les reproduit toutes les deux ? L'autre n'en manque qu'une — et vous
        ne savez pas laquelle.
      {:else if essai.tache === 'modulaire'}
        Deux références en {essai.arete.de.nom.toLowerCase()}, séparées d'un certain écart. Quel
        couple de {essai.arete.vers.nom.toLowerCase()} reproduit <strong class="font-medium">le
        même écart</strong> ? La position ne compte pas : seule compte la distance entre les deux.
      {:else}
        Lequel des deux {essai.arete.vers.nom.toLowerCase()} est au même niveau que
        la référence en {essai.arete.de.nom.toLowerCase()} ?
      {/if}
    </p>

    {#each essai.sousEssais as sousEssai, i (i)}
      <div class="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        {#if chargeReelle > 1}
          <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Correspondance {i + 1}</p>
        {/if}
        <div class="grid items-center gap-4 sm:grid-cols-[1fr_auto_2fr]">
          <div>
            <p class="mb-1 text-center text-xs text-slate-500 dark:text-slate-400">
              Référence{essai.partiel ? ' (partielle)' : ''}
            </p>
            <Stimulus
              stimulus={sousEssai.reference}
              partiel={essai.partiel}
              libelle="la première référence"
              auto={i === 0 && retour === 'attente'}
            />
            {#if sousEssai.reference2}
              <div class="mt-2">
                <Stimulus
                  stimulus={sousEssai.reference2}
                  partiel={essai.partiel}
                  libelle="la seconde référence"
                />
              </div>
            {/if}
          </div>
          <div class="hidden text-center text-slate-300 sm:block" aria-hidden="true">→</div>
          <div>
            {#if sousEssai.candidats[0]?.ancreStimulus}
              <!--
                En tâche modulaire, les deux candidats partagent le même point de
                départ : c'est l'écart qui les distingue. On ne le dessine donc
                qu'une fois, au-dessus des deux — le répéter suggérerait qu'il fait
                partie de ce qu'il faut comparer, alors que sa position est tirée
                au hasard et ne dit rien de la réponse.
              -->
              <div class="mb-3 rounded-lg border border-dashed border-slate-300 p-2 dark:border-slate-700">
                <p class="mb-1 text-center text-xs text-slate-500 dark:text-slate-400">
                  Point de départ commun
                </p>
                <Stimulus
                  stimulus={sousEssai.candidats[0].ancreStimulus}
                  libelle="le point de départ"
                />
              </div>
            {/if}
          <div class="grid grid-cols-2 gap-3">
            {#each sousEssai.candidats as candidat, j (j)}
              {@const cadre =
                retour === 'corrige' && candidat.juste
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                  : retour === 'corrige' && choix[i] === j
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30'
                    : choix[i] === j
                      ? 'border-indigo-500'
                      : 'border-slate-200 hover:border-indigo-300 dark:border-slate-800'}
              {#if candidat.stimulus.modalite === 'auditive'}
                <!--
                  Un candidat sonore porte deux commandes distinctes : écouter et
                  choisir. Envelopper le bouton d'écoute dans un bouton de choix
                  imbriquerait deux boutons, ce que le HTML interdit — et priverait
                  de toute façon d'une réécoute sans répondre.
                -->
                <div class="rounded-lg border-2 p-2 transition {cadre}">
                  <Stimulus
                    stimulus={candidat.stimulus}
                    parasite={candidat.parasite}
                    libelle="le candidat {j + 1}"
                  />
                  <button
                    type="button"
                    onclick={() => choisir(i, j)}
                    disabled={retour === 'corrige'}
                    class="mt-2 w-full rounded border border-slate-200 py-1.5 text-xs font-medium
                      text-slate-700 hover:border-indigo-300 disabled:opacity-50
                      dark:border-slate-700 dark:text-slate-200"
                  >choisir</button>
                </div>
              {:else}
                <button
                  type="button"
                  onclick={() => choisir(i, j)}
                  disabled={retour === 'corrige'}
                  class="rounded-lg border-2 p-2 transition {cadre}"
                  aria-label="Choisir le candidat {j + 1}"
                >
                  <Stimulus stimulus={candidat.stimulus} parasite={candidat.parasite} libelle="le candidat {j + 1}" />
                </button>
              {/if}
            {/each}
          </div>
          </div>
        </div>
      </div>
    {/each}

    <div class="mt-5 flex items-center gap-3">
      {#if retour === 'attente' && chargeReelle > 1}
        <button
          type="button"
          onclick={valider}
          disabled={!toutRepondu}
          class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white
            hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >Valider</button>
      {:else if retour === 'corrige'}
        <button
          type="button"
          onclick={suivant}
          class="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >{faits >= reglages.essais ? 'Voir le bilan' : 'Essai suivant'}</button>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          {reussis} bonne{reussis > 1 ? 's' : ''} sur {faits}
        </p>
      {/if}
    </div>
  </section>
{:else}
  <section>
    <h2 class="font-semibold text-slate-900 dark:text-white">Bilan de la session</h2>
    <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
      {reussis} essai{reussis > 1 ? 's' : ''} réussi{reussis > 1 ? 's' : ''} sur {faits}.
      {#if convergences.length}
        <span class="font-medium text-emerald-700 dark:text-emerald-300">
          {convergences.length} seuil{convergences.length > 1 ? 's' : ''}
          stabilisé{convergences.length > 1 ? 's' : ''}.
        </span>
      {/if}
      {#if xpGagne}<span class="font-medium text-indigo-700 dark:text-indigo-300">+{xpGagne} XP.</span>{/if}
    </p>
    <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
      Un taux de réussite proche de 70 % est le signe que l'escalier travaille au bon endroit : il
      resserre l'écart jusqu'au point où l'on se trompe environ une fois sur trois. Un taux bien
      plus haut voudrait dire que l'écart n'est pas encore assez fin.
    </p>

    <TableauDeBord {seuils} {sessions} {essaisDeLaPaire} />

    <button
      type="button"
      onclick={() => (etape = 'accueil')}
      class="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
    >Nouvelle session</button>
  </section>
{/if}
