<script lang="ts">
  /**
   * Connexion de l'éditeur au dépôt GitHub, une fois par appareil. Le jeton
   * est conservé dans ce navigateur, chiffré avec la clé de la session.
   */
  import {
    configurationParDefaut,
    enregistrerConfiguration,
    testerConfiguration,
  } from '../../lib/editeur/depot-github';
  import { BOUTON, CARTE, CHAMP } from './styles';

  let { onconfigure }: { onconfigure: () => void } = $props();

  const defaut = configurationParDefaut();
  let proprietaire = $state(defaut.proprietaire);
  let nom = $state(defaut.nom);
  let branche = $state(defaut.branche);
  let jeton = $state('');
  let erreur = $state('');
  let enCours = $state(false);

  async function valider(e: SubmitEvent) {
    e.preventDefault();
    erreur = '';
    enCours = true;
    const c = { proprietaire: proprietaire.trim(), nom: nom.trim(), branche: branche.trim() || 'main', jeton: jeton.trim() };
    try {
      await testerConfiguration(c);
      await enregistrerConfiguration(c);
      onconfigure();
    } catch (err) {
      erreur = err instanceof Error ? err.message : String(err);
    } finally {
      enCours = false;
    }
  }
</script>

<div class="mx-auto max-w-2xl space-y-5">
  <div class={CARTE}>
    <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Connecter l'éditeur à GitHub</h2>
    <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
      En ligne, l'éditeur enregistre vos fiches, chiffrées, dans votre dépôt GitHub ; chaque
      enregistrement republie le site en une à trois minutes. À faire une fois sur chaque appareil.
    </p>

    <ol class="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
      <li>
        Ouvrez
        <a class="font-medium text-indigo-600 underline dark:text-indigo-400" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">la création d'un jeton GitHub</a>
        (« Fine-grained token »).
      </li>
      <li>Donnez-lui un nom (« Éditeur de fiches ») et une date d'expiration.</li>
      <li>« Repository access » : <strong>Only select repositories</strong>, puis ce seul dépôt.</li>
      <li>
        « Permissions » : <strong>Contents</strong> en <em>Read and write</em>, <strong>Actions</strong> en
        <em>Read-only</em>.
      </li>
      <li>Générez le jeton et collez-le ci-dessous.</li>
    </ol>

    <form class="mt-5 space-y-3" onsubmit={valider}>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="block">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Compte</span>
          <input class={CHAMP} bind:value={proprietaire} required autocomplete="off" />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Dépôt</span>
          <input class={CHAMP} bind:value={nom} required autocomplete="off" />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Branche</span>
          <input class={CHAMP} bind:value={branche} autocomplete="off" />
        </label>
      </div>
      <label class="block">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400">Jeton d'accès</span>
        <input class={CHAMP} type="password" bind:value={jeton} required autocomplete="off" placeholder="github_pat_…" />
      </label>
      {#if erreur}
        <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">{erreur}</p>
      {/if}
      <button type="submit" class={BOUTON} disabled={enCours || !jeton.trim()}>{enCours ? 'Vérification…' : 'Vérifier et connecter'}</button>
    </form>
  </div>
  <p class="text-xs text-slate-500 dark:text-slate-400">
    Le jeton reste dans ce navigateur, chiffré avec votre mot de passe ; il n'est envoyé qu'à GitHub.
    Le cadenas 🔒 du site verrouille la session, ce qui le rend inutilisable jusqu'à la prochaine connexion.
  </p>
</div>
