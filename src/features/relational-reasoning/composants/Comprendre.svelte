<script lang="ts">
  /**
   * L'espace « Comprendre » : ce que chaque exercice demande, ouvert ou non.
   *
   * Il est consultable depuis l'accueil et **n'interrompt jamais une session**.
   * C'est la raison d'être de ce composant séparé : une explication imposée
   * avant chaque item transformerait l'inférence — qui est l'exercice — en
   * lecture de consigne.
   */
  import { FAMILLES, type EtatMoteur } from '../progression';

  let {
    etats = [] as EtatMoteur[],
    tutoriels = true,
    onBasculerTutoriels,
  }: {
    etats: EtatMoteur[];
    tutoriels: boolean;
    onBasculerTutoriels: () => void;
  } = $props();

  const familles = $derived([
    ...FAMILLES.map((famille) => ({
      nom: famille.nom,
      resume: famille.resume,
      ouverture: famille.ouverture,
      moteurs: etats.filter((etat) => etat.moteur.categorie === famille.id),
    })),
    {
      nom: 'Induction',
      resume: 'Retrouver une règle à partir d’exemples. Ouvert dès le départ.',
      ouverture: '',
      moteurs: etats.filter((etat) => etat.moteur.categorie === 'induction'),
    },
  ]);
</script>

<div class="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
  <p class="text-sm text-slate-600 dark:text-slate-300">
    Chaque famille s'ouvre par un exercice ; les autres se débloquent quand celui-là est maîtrisé.
    Chaque exercice monte ensuite sa propre échelle de difficulté, selon vos réussites sur lui seul.
  </p>

  {#each familles as famille (famille.nom)}
    <section class="mt-4">
      <h3 class="text-sm font-semibold text-slate-900 dark:text-white">{famille.nom}</h3>
      <p class="text-xs text-slate-500 dark:text-slate-400">{famille.resume}</p>
      <ul class="mt-2 space-y-1.5">
        {#each famille.moteurs as etat (etat.moteur.id)}
          <li class="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span class="font-medium {etat.ouvert
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-400 dark:text-slate-500'}">{etat.moteur.nom}</span>
            {#if etat.ouvert}
              <span class="text-xs text-indigo-700 dark:text-indigo-300">niveau {etat.echelon}</span>
              {#if etat.items}
                <span class="text-xs text-slate-400">
                  {etat.items} item{etat.items > 1 ? 's' : ''}, {Math.round(etat.taux * 100)} % de réussite
                </span>
              {/if}
            {:else}
              <span class="text-xs text-slate-400 dark:text-slate-500">
                à débloquer en maîtrisant l'exercice d'ouverture de cette famille
              </span>
            {/if}
            <span class="w-full text-xs text-slate-500 dark:text-slate-400">{etat.moteur.resume}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  <label class="mt-5 flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-4 text-sm
    text-slate-700 dark:border-slate-800 dark:text-slate-200">
    <input type="checkbox" checked={tutoriels} onchange={onBasculerTutoriels} />
    Rappeler en une ligne ce que demande l'exercice, au-dessus de chaque question
  </label>
</div>
