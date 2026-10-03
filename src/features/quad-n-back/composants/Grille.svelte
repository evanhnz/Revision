<script>
  /**
   * La grille de jeu : 3×3×3 en rotation lente, ou 3×3 fixe.
   *
   * Structure reprise de « quad-box » (src/lib/Grid.svelte, licence MIT) :
   * une scène en perspective, des plans de repère, et une cellule active.
   * Le cadre est ici dessiné en CSS plutôt que chargé en SVG, pour suivre
   * automatiquement le thème clair/sombre du site.
   */
  import Cellule from './Cellule.svelte';

  let {
    epreuve = null,
    visible = false,
    grille3D = true,
    sombre = false,
    vitesseRotation = 60,
    dimensions = [],
    sourceMotif = 'voronoi',
  } = $props();

  // Une dimension inactive ne doit pas transparaître dans l'affichage.
  const position = $derived(dimensions.includes('position') ? epreuve?.position : '1-1-1');
  const couleur = $derived(dimensions.includes('couleur') ? epreuve?.couleur : null);
  const forme = $derived(dimensions.includes('forme') ? epreuve?.forme : null);
  const motif = $derived(dimensions.includes('motif') ? epreuve?.motif : null);

  // Quatre plans par axe délimitent les trois tranches de la grille.
  const plans = [-1.5, -0.5, 0.5, 1.5];
</script>

<div class="scene-hote" class:plat={!grille3D}>
  <div
    class="scene"
    class:tourne={grille3D}
    style="animation-duration: {vitesseRotation}s"
  >
    {#if grille3D}
      <!-- Plans de repère : sans eux la profondeur n'est pas lisible. -->
      {#each plans as p (p)}
        <div class="cadre" style="transform: translateZ(calc({p} * var(--pas)))"></div>
        <div class="cadre" style="transform: translateY(calc({p} * var(--pas))) rotateX(90deg)"></div>
        <div class="cadre" style="transform: translateX(calc({p} * var(--pas))) rotateY(90deg)"></div>
      {/each}
    {:else}
      <div class="cadre"></div>
    {/if}

    <Cellule {position} {couleur} {forme} {motif} {sourceMotif} {visible} {sombre} {grille3D} />
  </div>
</div>

<style>
  .scene-hote {
    /*
      Une grille 3×3×3 en rotation balaie une sphère de rayon 0,87 × côté :
      c'est la hauteur disponible, et non la largeur, qui dicte sa taille.
    */
    --taille: min(68vw, 30svh);
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    max-height: 64svh;
    /*
      Perspective proportionnelle à la scène, et non en unités d'écran : en
      svmin elle devenait trop courte sur mobile, où svmin vaut la largeur —
      les cubes de la tranche avant grossissaient alors jusqu'à sortir du cadre.
    */
    perspective: calc(var(--taille) * 4);
    overflow: hidden;
  }

  /* En 2D, ni rotation ni perspective : la grille peut occuper bien plus de place. */
  .scene-hote.plat {
    --taille: min(86vw, 52svh);
  }

  .scene {
    /*
      La taille est exprimée en unités absolues, jamais en pourcentage :
      translateZ() n'accepte pas les pourcentages et invaliderait toute la
      transformation — les faces du cube se superposeraient au centre et la
      dimension « position » ne serait plus visible.
    */
    /* --taille est défini par le conteneur, qui en dérive aussi la perspective. */
    --pas: calc(var(--taille) / 3);
    position: relative;
    width: var(--taille);
    height: var(--taille);
    transform-style: preserve-3d;
  }

  .tourne {
    animation: rotation linear 0s infinite;
    will-change: transform;
  }

  @keyframes rotation {
    from { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
    to   { transform: rotateX(360deg) rotateY(360deg) rotateZ(360deg); }
  }

  /* Un plan de repère : 3×3 cases délimitées, sans remplissage. */
  .cadre {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    border: 1px solid currentColor;
    opacity: 0.16;
    background-image:
      linear-gradient(to right, transparent calc(100% / 3 - 0.5px), currentColor calc(100% / 3 - 0.5px), currentColor calc(100% / 3 + 0.5px), transparent calc(100% / 3 + 0.5px)),
      linear-gradient(to bottom, transparent calc(100% / 3 - 0.5px), currentColor calc(100% / 3 - 0.5px), currentColor calc(100% / 3 + 0.5px), transparent calc(100% / 3 + 0.5px)),
      linear-gradient(to right, transparent calc(200% / 3 - 0.5px), currentColor calc(200% / 3 - 0.5px), currentColor calc(200% / 3 + 0.5px), transparent calc(200% / 3 + 0.5px)),
      linear-gradient(to bottom, transparent calc(200% / 3 - 0.5px), currentColor calc(200% / 3 - 0.5px), currentColor calc(200% / 3 + 0.5px), transparent calc(200% / 3 + 0.5px));
  }

  @media (prefers-reduced-motion: reduce) {
    .tourne {
      animation: none;
    }
  }
</style>
