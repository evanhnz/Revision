<!--
  Panneau de progression de Relational Reasoning.

  Trois lectures, et l'ordre compte. Par **famille** on voit ce qui est ouvert et
  ce qu'il reste à faire pour ouvrir le reste ; par **moteur** on voit où en est
  chaque compétence ; par **système** on voit sur quel vocabulaire on se trompe —
  et c'est la plus utile des trois, parce qu'un taux qui tient sur la ligne et
  s'effondre sur les intervalles ne signale pas une faiblesse de raisonnement mais
  une algèbre mal comprise.

  Le taux affiché est une **moyenne de notes**, non une proportion de réussites :
  sur les moteurs à sélection multiple une réponse partielle vaut entre zéro et
  un, et l'arrondir en « raté » effacerait ce que le barème mesure.
-->
<script lang="ts">
  import { CONDITIONS_MAITRISE, type Statistiques } from '../progression';

  let { stats }: { stats: Statistiques } = $props();

  const pourcent = (n: number) => `${Math.round(n * 100)} %`;
</script>

<div class="mt-4 space-y-5 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
  <p class="text-slate-600 dark:text-slate-300">
    {stats.items} item{stats.items > 1 ? 's' : ''} joué{stats.items > 1 ? 's' : ''},
    {stats.reussis} entièrement réussi{stats.reussis > 1 ? 's' : ''}, note moyenne
    {pourcent(stats.moyenne)}.
  </p>

  <section>
    <h3 class="font-semibold text-slate-900 dark:text-white">Familles</h3>
    <ul class="mt-2 space-y-2">
      {#each stats.parFamille as ligne (ligne.famille.id)}
        <li class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-slate-700 dark:text-slate-200">
            {ligne.famille.nom}
            {#if ligne.debloquee}
              <span class="ml-1 text-emerald-700 dark:text-emerald-400">— ouverte en entier</span>
            {/if}
          </span>
          {#if !ligne.debloquee}
            <span class="text-xs text-slate-500 dark:text-slate-400">
              {#if ligne.resteItems > 0}
                encore {ligne.resteItems} item{ligne.resteItems > 1 ? 's' : ''} sur l'exercice
                d'ouverture
              {:else}
                {pourcent(ligne.taux)} sur les {CONDITIONS_MAITRISE.fenetre} derniers —
                il en faut {pourcent(CONDITIONS_MAITRISE.taux)}
              {/if}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  {#if stats.parMoteur.length}
    <section>
      <h3 class="font-semibold text-slate-900 dark:text-white">Par exercice</h3>
      <table class="mt-2 w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <tr>
            <th scope="col" class="pb-1 font-medium">Exercice</th>
            <th scope="col" class="pb-1 text-right font-medium">Échelon</th>
            <th scope="col" class="pb-1 text-right font-medium">Items</th>
            <th scope="col" class="pb-1 text-right font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {#each stats.parMoteur as ligne (ligne.moteur.id)}
            <tr class="border-t border-slate-100 dark:border-slate-800">
              <td class="py-1 text-slate-700 dark:text-slate-200">{ligne.moteur.nom}</td>
              <td class="py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {ligne.echelon} / 10
              </td>
              <td class="py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">{ligne.items}</td>
              <td class="py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {pourcent(ligne.taux)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if stats.parSysteme.length}
    <section>
      <h3 class="font-semibold text-slate-900 dark:text-white">Par système</h3>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
        C'est ici qu'on repère une algèbre mal comprise plutôt qu'une difficulté de raisonnement.
      </p>
      <table class="mt-2 w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <tr>
            <th scope="col" class="pb-1 font-medium">Système</th>
            <th scope="col" class="pb-1 text-right font-medium">Items</th>
            <th scope="col" class="pb-1 text-right font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {#each stats.parSysteme as ligne (ligne.systeme.id)}
            <tr class="border-t border-slate-100 dark:border-slate-800">
              <td class="py-1 text-slate-700 dark:text-slate-200">{ligne.systeme.nom}</td>
              <td class="py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">{ligne.items}</td>
              <td class="py-1 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {pourcent(ligne.moyenne)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>
