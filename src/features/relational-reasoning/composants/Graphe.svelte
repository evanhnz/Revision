<script lang="ts">
  /**
   * Un réseau d'arêtes étiquetées, disposé en cercle.
   *
   * La disposition circulaire est délibérément **sans signification** : aucune
   * position n'y traduit une propriété du réseau. C'est une exigence des moteurs
   * d'appariement, où un placement parlant donnerait la réponse sans passer par
   * la structure.
   *
   * Le thème est suivi par les couleurs de tokens du site plutôt que par des
   * valeurs figées, pour que le dessin reste lisible en clair comme en sombre.
   */
  let {
    noeuds = [] as string[],
    aretes = [] as { de: string; a: string; libelle: string; sorte?: 'positif' | 'negatif' }[],
    manquante = undefined as { de: string; a: string } | undefined,
  }: {
    noeuds: string[];
    aretes: { de: string; a: string; libelle: string; sorte?: 'positif' | 'negatif' }[];
    manquante?: { de: string; a: string };
  } = $props();

  const COTE = 300;
  const RAYON = 110;
  const RAYON_NOEUD = 18;

  const positions = $derived(
    new Map(
      noeuds.map((nom, i) => {
        // On part du haut et on tourne dans le sens des aiguilles.
        const angle = (i / Math.max(1, noeuds.length)) * 2 * Math.PI - Math.PI / 2;
        return [
          nom,
          { x: COTE / 2 + RAYON * Math.cos(angle), y: COTE / 2 + RAYON * Math.sin(angle) },
        ];
      }),
    ),
  );

  /**
   * Le segment raccourci de chaque côté, pour qu'une flèche s'arrête au bord du
   * disque et non en son centre.
   */
  function segment(de: string, a: string) {
    const p = positions.get(de);
    const q = positions.get(a);
    if (!p || !q) return null;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const longueur = Math.hypot(dx, dy) || 1;
    const marge = RAYON_NOEUD + 3;
    return {
      x1: p.x + (dx / longueur) * marge,
      y1: p.y + (dy / longueur) * marge,
      x2: q.x - (dx / longueur) * marge,
      y2: q.y - (dy / longueur) * marge,
      mx: (p.x + q.x) / 2,
      my: (p.y + q.y) / 2,
    };
  }
</script>

<figure class="my-3 flex justify-center">
  <svg viewBox="0 0 {COTE} {COTE}" class="h-auto w-full max-w-sm" role="img"
    aria-label="Réseau de {noeuds.length} entités et {aretes.length} relations">
    <defs>
      <marker id="fleche-rr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5"
        markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" class="fill-slate-400 dark:fill-slate-500" />
      </marker>
    </defs>

    {#each aretes as arete, i (`${arete.de}-${arete.a}-${i}`)}
      {@const s = segment(arete.de, arete.a)}
      {#if s}
        <line
          x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          marker-end="url(#fleche-rr)"
          stroke-width="1.5"
          stroke-dasharray={arete.sorte === 'negatif' ? '5 3' : undefined}
          class={arete.sorte === 'negatif'
            ? 'stroke-rose-400 dark:stroke-rose-500'
            : 'stroke-slate-400 dark:stroke-slate-500'}
        />
        <text x={s.mx} y={s.my - 4} text-anchor="middle"
          class="fill-slate-500 text-[9px] dark:fill-slate-400">{arete.libelle}</text>
      {/if}
    {/each}

    {#if manquante}
      {@const s = segment(manquante.de, manquante.a)}
      {#if s}
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke-width="1.5" stroke-dasharray="2 4"
          class="stroke-indigo-400 dark:stroke-indigo-500" />
        <text x={s.mx} y={s.my - 4} text-anchor="middle"
          class="fill-indigo-500 text-[10px] font-bold dark:fill-indigo-400">?</text>
      {/if}
    {/if}

    {#each noeuds as nom (nom)}
      {@const p = positions.get(nom)}
      {#if p}
        <circle cx={p.x} cy={p.y} r={RAYON_NOEUD}
          class="fill-white stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-700"
          stroke-width="1.5" />
        <text x={p.x} y={p.y + 4} text-anchor="middle"
          class="fill-slate-900 text-[11px] font-semibold dark:fill-white">{nom}</text>
      {/if}
    {/each}
  </svg>
</figure>
