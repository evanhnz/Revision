<script lang="ts">
  /**
   * Le tableau de bord des seuils.
   *
   * Cinq vues, dans l'ordre où elles servent : la matrice du hub pour
   * l'ensemble, la force par dimension pour repérer les points faibles, l'arbre
   * couvrant courant, l'évolution du seuil médian, et le journal des sessions.
   *
   * **La couleur encode une magnitude, donc une seule teinte du clair au
   * foncé** — la rampe Bleu France du site, qui est monotone en clarté. Pas
   * d'arc-en-ciel : un dégradé multicolore laisserait croire à des catégories
   * là où il n'y a qu'une échelle. Les pas clairs de la rampe n'atteignent pas
   * trois pour un de contraste avec le fond ; la valeur est donc écrite dans
   * chaque cellule et l'ensemble existe aussi en tableau, ce qui est la
   * contrepartie exigée.
   *
   * Le mode sombre a ses propres pas, choisis contre le fond sombre, et non la
   * rampe claire inversée.
   */
  import { effacerVeridical, type SeuilVeridical, type SessionVeridical } from '../../../lib/db';
  import { DIMENSIONS, dimensionsDeFamille, type Famille } from '../dimensions';
  import { INTITULES_STATUT } from '../escalier';
  import { arbreCouvrant, idArete } from '../hub';

  let {
    seuils = {} as Record<string, SeuilVeridical>,
    sessions = [] as SessionVeridical[],
    essaisDeLaPaire,
  }: {
    seuils: Record<string, SeuilVeridical>;
    sessions: SessionVeridical[];
    essaisDeLaPaire: (a: string, b: string) => number;
  } = $props();

  let famille = $state<Famille>('prothetique');
  let detail = $state<SeuilVeridical | null>(null);
  let efface = $state(false);

  const dims = $derived(dimensionsDeFamille(famille));
  const lignes = $derived(Object.values(seuils));

  /**
   * Cinq pas de la rampe, du seuil le plus grossier au plus fin. Un seuil fin
   * est une réussite : il reçoit donc le pas le plus foncé, le plus appuyé.
   */
  const PAS_RAMPE = [
    'bg-indigo-100 text-slate-900 dark:bg-indigo-950 dark:text-indigo-200',
    'bg-indigo-200 text-slate-900 dark:bg-indigo-900 dark:text-indigo-100',
    'bg-indigo-300 text-slate-900 dark:bg-indigo-800 dark:text-white',
    'bg-indigo-500 text-white dark:bg-indigo-500 dark:text-white',
    'bg-indigo-600 text-white dark:bg-indigo-400 dark:text-slate-950',
  ];

  /** Bornes des pas, en pas de stimulus. Plus le seuil est petit, plus c'est fin. */
  function classeDuSeuil(valeur: number | null | undefined): string {
    if (valeur === null || valeur === undefined) {
      return 'bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-500';
    }
    if (valeur > 24) return PAS_RAMPE[0];
    if (valeur > 12) return PAS_RAMPE[1];
    if (valeur > 6) return PAS_RAMPE[2];
    if (valeur > 3) return PAS_RAMPE[3];
    return PAS_RAMPE[4];
  }

  function cellule(de: string, vers: string): SeuilVeridical | undefined {
    return seuils[idArete(de, vers)];
  }

  const forceParNoeud = $derived(
    DIMENSIONS.map((dimension) => {
      const siennes = lignes.filter(
        (ligne) => ligne.de === dimension.id || ligne.vers === dimension.id,
      );
      const mesurees = siennes.filter((l) => typeof l.seuil === 'number');
      return {
        dimension,
        aretes: siennes.filter((l) => l.escalier.essais > 0).length,
        stabilisees: siennes.filter((l) => l.statut === 'converge').length,
        moyen: mesurees.length
          ? mesurees.reduce((total, l) => total + (l.seuil ?? 0), 0) / mesurees.length
          : null,
      };
    }).filter((entree) => entree.aretes > 0),
  );

  const arbre = $derived(arbreCouvrant(famille, essaisDeLaPaire));

  /** Les sessions du plus ancien au plus récent, pour la courbe. */
  const courbe = $derived(
    sessions
      .filter((session) => typeof session.seuilMedian === 'number')
      .slice()
      .sort((a, b) => a.le.localeCompare(b.le))
      .map((session) => ({ le: session.le, valeur: session.seuilMedian as number })),
  );

  const maximum = $derived(Math.max(8, ...courbe.map((point) => point.valeur)));
  const LARGEUR = 520;
  const HAUTEUR = 140;
  const MARGE = { gauche: 34, bas: 22, haut: 10, droite: 10 };

  function abscisse(i: number): number {
    if (courbe.length < 2) return MARGE.gauche + (LARGEUR - MARGE.gauche - MARGE.droite) / 2;
    return MARGE.gauche + ((LARGEUR - MARGE.gauche - MARGE.droite) * i) / (courbe.length - 1);
  }
  function ordonnee(valeur: number): number {
    const utile = HAUTEUR - MARGE.haut - MARGE.bas;
    return MARGE.haut + utile - (utile * valeur) / maximum;
  }
  const trace = $derived(
    courbe.map((point, i) => `${i ? 'L' : 'M'}${abscisse(i)},${ordonnee(point.valeur)}`).join(' '),
  );

  const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

  function exporter() {
    const contenu = JSON.stringify(
      { format: 'revinsp-veridical', version: 1, exporteLe: new Date().toISOString(), seuils: lignes, sessions },
      null,
      2,
    );
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    lien.download = `veridical-mapping-${new Date().toISOString().slice(0, 10)}.json`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  async function effacer() {
    if (!confirm('Effacer tous les seuils et le journal de Veridical Mapping ? Le reste de votre progression n’est pas touché.')) return;
    await effacerVeridical();
    efface = true;
  }
</script>

<div class="mt-4 space-y-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h3 class="text-sm font-semibold text-slate-900 dark:text-white">Tableau de bord</h3>
    <div class="flex gap-2">
      {#each [['prothetique', 'Prothétique'], ['metathetique', 'Métathétique']] as [valeur, nom] (valeur)}
        <button
          type="button"
          onclick={() => (famille = valeur as Famille)}
          class="rounded border px-2.5 py-1 text-xs font-medium
            {famille === valeur
              ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
              : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}"
        >{nom}</button>
      {/each}
    </div>
  </div>

  {#if efface}
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Seuils effacés. Rechargez la page pour repartir de zéro.
    </p>
  {/if}

  <!-- 1. Matrice du hub -->
  <section>
    <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      Matrice du hub
    </h4>
    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
      Seuil en pas, de la ligne vers la colonne. Plus la cellule est foncée, plus le seuil est fin.
      Les deux sens d'une paire se lisent de part et d'autre de la diagonale.
    </p>
    <div class="mt-2 overflow-x-auto">
      <table class="text-xs">
        <thead>
          <tr>
            <th class="p-1 text-left font-medium text-slate-500 dark:text-slate-400">de \ vers</th>
            {#each dims as dimension (dimension.id)}
              <th class="p-1 font-medium text-slate-600 dark:text-slate-300">{dimension.nom}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each dims as ligne (ligne.id)}
            <tr>
              <th class="p-1 text-left font-medium text-slate-600 dark:text-slate-300">{ligne.nom}</th>
              {#each dims as colonne (colonne.id)}
                <td class="p-0.5">
                  {#if ligne.id === colonne.id}
                    <span class="flex h-9 w-16 items-center justify-center text-slate-300 dark:text-slate-700">·</span>
                  {:else}
                    {@const donnee = cellule(ligne.id, colonne.id)}
                    <button
                      type="button"
                      onclick={() => (detail = donnee ?? null)}
                      class="flex h-9 w-16 items-center justify-center rounded font-mono
                        {classeDuSeuil(donnee?.seuil)}"
                      title="{ligne.nom} → {colonne.nom} — {donnee
                        ? `${donnee.escalier.essais} essais, ${INTITULES_STATUT[donnee.statut]}`
                        : 'jamais travaillée'}"
                    >
                      {donnee?.seuil ? donnee.seuil.toFixed(1) : donnee?.escalier.essais ? '…' : '—'}
                    </button>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if detail}
      <p class="mt-2 rounded border border-slate-200 p-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <strong>{detail.de} → {detail.vers}</strong> — {detail.escalier.essais} essai(s),
        {detail.escalier.reussis} réussi(s), {detail.escalier.inversions.length} inversion(s),
        {INTITULES_STATUT[detail.statut]}{#if detail.seuil}, seuil {detail.seuil.toFixed(2)} pas{/if}.
        {#if detail.horsFamille}<span class="text-amber-700 dark:text-amber-300"> Paire hors famille.</span>{/if}
      </p>
    {/if}
  </section>

  <!-- 2. Force par nœud -->
  <section>
    <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      Force par dimension
    </h4>
    {#if forceParNoeud.length}
      <table class="mt-2 w-full text-xs">
        <thead>
          <tr class="text-left text-slate-500 dark:text-slate-400">
            <th class="py-1 font-medium">Dimension</th>
            <th class="py-1 font-medium">Arêtes travaillées</th>
            <th class="py-1 font-medium">Stabilisées</th>
            <th class="py-1 font-medium">Seuil moyen</th>
          </tr>
        </thead>
        <tbody>
          {#each forceParNoeud as entree (entree.dimension.id)}
            <tr class="border-t border-slate-100 dark:border-slate-800">
              <td class="py-1 text-slate-800 dark:text-slate-200">{entree.dimension.nom}</td>
              <td class="py-1 font-mono text-slate-600 dark:text-slate-300">{entree.aretes}</td>
              <td class="py-1 font-mono text-slate-600 dark:text-slate-300">{entree.stabilisees}</td>
              <td class="py-1 font-mono text-slate-600 dark:text-slate-300">
                {entree.moyen === null ? '—' : `${entree.moyen.toFixed(1)} pas`}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Aucune arête travaillée pour l'instant.</p>
    {/if}
  </section>

  <!-- 3. Arbre couvrant -->
  <section>
    <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      Arbre couvrant courant
    </h4>
    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
      Le plus petit ensemble de paires reliant toutes les dimensions de la famille. Il se déplace
      vers les paires les moins travaillées à mesure que l'entraînement avance.
    </p>
    <ul class="mt-2 flex flex-wrap gap-2">
      {#each arbre as paire (paire.a.id + paire.b.id)}
        <li class="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
          {paire.a.nom} ↔ {paire.b.nom}
        </li>
      {/each}
    </ul>
  </section>

  <!-- 4. Seuil médian au fil des sessions -->
  <section>
    <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      Seuil médian au fil des sessions
    </h4>
    {#if courbe.length}
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        En pas. Une courbe qui descend est un progrès : le seuil devient plus fin.
      </p>
      <svg viewBox="0 0 {LARGEUR} {HAUTEUR}" class="mt-2 h-auto w-full max-w-xl" role="img"
        aria-label="Seuil médian sur {courbe.length} session(s)">
        <line x1={MARGE.gauche} y1={ordonnee(0)} x2={LARGEUR - MARGE.droite} y2={ordonnee(0)}
          class="stroke-slate-200 dark:stroke-slate-700" stroke-width="1" />
        <text x="4" y={ordonnee(maximum) + 4} class="fill-slate-400 text-[9px]">{maximum.toFixed(0)}</text>
        <text x="4" y={ordonnee(0) + 4} class="fill-slate-400 text-[9px]">0</text>
        {#if courbe.length > 1}
          <path d={trace} fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
            class="stroke-indigo-600 dark:stroke-indigo-400" />
        {/if}
        {#each courbe as point, i (point.le)}
          <circle cx={abscisse(i)} cy={ordonnee(point.valeur)} r="4.5"
            class="fill-indigo-600 stroke-white dark:fill-indigo-400 dark:stroke-slate-900" stroke-width="2">
            <title>{jour(point.le)} — {point.valeur.toFixed(2)} pas</title>
          </circle>
        {/each}
      </svg>
    {:else}
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Le seuil médian apparaîtra dès qu'une session aura produit au moins une mesure.
      </p>
    {/if}
  </section>

  <!-- 5. Journal -->
  <section>
    <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      Journal des sessions
    </h4>
    {#if sessions.length}
      <div class="mt-2 max-h-56 overflow-y-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-slate-500 dark:text-slate-400">
              <th class="py-1 font-medium">Date</th>
              <th class="py-1 font-medium">Famille</th>
              <th class="py-1 font-medium">Parcours</th>
              <th class="py-1 font-medium">Essais</th>
              <th class="py-1 font-medium">Réussite</th>
              <th class="py-1 font-medium">Seuil médian</th>
            </tr>
          </thead>
          <tbody>
            {#each sessions as session (session.le)}
              <tr class="border-t border-slate-100 dark:border-slate-800">
                <td class="py-1 text-slate-800 dark:text-slate-200">{jour(session.le)}</td>
                <td class="py-1 text-slate-600 dark:text-slate-300">
                  {session.famille === 'prothetique' ? 'Prothétique' : 'Métathétique'}
                </td>
                <td class="py-1 text-slate-600 dark:text-slate-300">
                  {session.mode === 'squelette' ? 'Arbre' : 'Toutes'}
                </td>
                <td class="py-1 font-mono text-slate-600 dark:text-slate-300">{session.essais}</td>
                <td class="py-1 font-mono text-slate-600 dark:text-slate-300">
                  {session.essais ? Math.round((session.reussis / session.essais) * 100) : 0} %
                </td>
                <td class="py-1 font-mono text-slate-600 dark:text-slate-300">
                  {session.seuilMedian === null ? '—' : `${session.seuilMedian.toFixed(1)}`}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Aucune session enregistrée.</p>
    {/if}
  </section>

  <div class="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
    <button
      type="button"
      onclick={exporter}
      class="rounded border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700
        hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200"
    >Exporter en JSON</button>
    <button
      type="button"
      onclick={effacer}
      class="rounded border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700
        hover:border-rose-400 dark:border-rose-800 dark:text-rose-300"
    >Effacer les seuils</button>
  </div>
</div>
