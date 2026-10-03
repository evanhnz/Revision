<script>
  /**
   * Un bloc de la grille : cube à six faces en 3D, carré simple en 2D.
   *
   * Rendu repris de « quad-box » (src/lib/Cell.svelte et Grid.svelte, licence
   * MIT) : mêmes formes, mêmes palettes, et surtout mêmes règles d'affectation
   * des couleurs — la face du cube reste claire et c'est la FORME qui porte la
   * couleur ; le cube ne se colore que lorsque la dimension « forme » est
   * inactive.
   *
   * Adaptations : la position est calculée plutôt qu'énumérée en 27 classes,
   * et les formes sont dessinées en SVG inline au lieu d'URL de blob — ce qui
   * évite de créer des objets jamais libérés.
   */
  import { SHAPES, LIGHT_PALETTE, DARK_PALETTE } from '../moteur/constantes.js';
  import { createVoronoiSvg } from '../moteur/voronoi.js';
  import { createArtSvg } from '../moteur/generative.js';

  let {
    position = null,
    couleur = null,
    forme = null,
    motif = null,
    sourceMotif = 'voronoi',
    visible = false,
    sombre = false,
    grille3D = true,
  } = $props();

  // « 0-1-2 » -> décalages de -1, 0 ou +1 case sur chaque axe.
  const axes = $derived((position ?? '').split('-').map((v) => Number(v) - 1));

  const transform = $derived(
    grille3D
      ? `translate3d(calc(${axes[0] ?? 0} * var(--pas)), calc(${axes[1] ?? 0} * var(--pas)), calc(${axes[2] ?? 0} * var(--pas)))`
      : `translate(calc(${axes[0] ?? 0} * var(--pas)), calc(${axes[1] ?? 0} * var(--pas)))`,
  );

  const palette = $derived(sombre ? DARK_PALETTE : LIGHT_PALETTE);

  /**
   * Couleur de la face, règle de quad-box :
   * une forme ou un motif impose une face claire qui leur sert de support ;
   * sans eux, c'est la face elle-même qui porte la couleur.
   */
  const fond = $derived(
    forme || motif
      ? sombre
        ? couleur
          ? '#FDFDFD'
          : '#EEEEEE'
        : '#FAFAFA'
      : couleur
        ? palette[couleur]
        : sombre
          ? '#FDFDFD'
          : '#313131',
  );

  const trace = $derived(forme ? SHAPES[forme] : null);

  /** Remplissage de la forme : la couleur du tirage, ou le ton neutre « inner ». */
  const remplissage = $derived(
    couleur ? palette[couleur] : sombre ? '#FFFFFF' : '#313131',
  );
  const contour = $derived(sombre ? '#333' : '#222');

  /** Le cœur du dessin déborde moins pour le cœur : réglage repris tel quel. */
  const tailleForme = $derived(forme === 'heart' ? '100% 95%' : '80% 80%');

  /** Image du motif, générée à la volée et mise en cache par graine. */
  const cacheMotifs = new Map();
  const urlMotif = $derived.by(() => {
    if (!motif) return null;
    const cle = `${sourceMotif}|${motif}|${sombre}`;
    if (cacheMotifs.has(cle)) return cacheMotifs.get(cle);
    const theme = sombre ? 'dark' : 'light';
    const [graine, decoupes] = String(motif).split('-');
    // Une graine Voronoï s'écrit « graine-découpes », une graine générative est
    // un simple nombre : le format tranche, même si la source transmise ne
    // correspondait pas — sans quoi le moteur produirait un SVG vide.
    const svg =
      decoupes === undefined
        ? createArtSvg(graine, 400, 400, theme)
        : createVoronoiSvg(graine, decoupes, theme);
    if (sourceMotif === 'generatif' && decoupes !== undefined) {
      console.warn('Quad N-Back : motif Voronoï rendu alors que la source déclarée est générative.');
    }
    const url = `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')}`;
    cacheMotifs.set(cle, url);
    return url;
  });
</script>

{#if visible && position}
  <div class="cellule" class:plat={!grille3D} style="transform: {transform}">
    {#each grille3D ? [0, 1, 2, 3, 4, 5] : [0] as face (face)}
      <div
        class="face face-{face}"
        style="background-color: {fond}; {urlMotif
          ? `background-image: url('${urlMotif}'); background-size: ${tailleForme};`
          : ''}"
      >
        {#if trace}
          <svg viewBox="0 0 110 110" aria-hidden="true" style="width: {forme === 'heart' ? 100 : 80}%; height: {forme === 'heart' ? 95 : 80}%">
            <path d={trace} fill={remplissage} stroke={contour} stroke-width="2" />
          </svg>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .cellule {
    position: absolute;
    width: var(--pas);
    height: var(--pas);
    left: var(--pas);
    top: var(--pas);
    transform-style: preserve-3d;
  }

  .face {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 3px;
    background-position: center;
    background-repeat: no-repeat;
    /*
      Les faces reprennent le ton très clair de quad-box (#FAFAFA), proche du
      fond de page du site : sans un contour franc, le cube disparaîtrait et
      la dimension « position » deviendrait illisible.
    */
    box-shadow: inset 0 0 0 1.5px rgb(15 23 42 / 0.55);
  }

  /* Les six faces du cube, à une demi-arête du centre. */
  .face-0 { transform: translateZ(calc(var(--pas) / 2)); }
  .face-1 { transform: translateZ(calc(var(--pas) / -2)) rotateY(180deg); }
  .face-2 { transform: translateX(calc(var(--pas) / 2)) rotateY(90deg); }
  .face-3 { transform: translateX(calc(var(--pas) / -2)) rotateY(-90deg); }
  .face-4 { transform: translateY(calc(var(--pas) / 2)) rotateX(-90deg); }
  .face-5 { transform: translateY(calc(var(--pas) / -2)) rotateX(90deg); }

  .plat .face {
    transform: none;
  }
</style>
