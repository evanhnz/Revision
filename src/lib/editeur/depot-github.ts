/**
 * Dépôt GitHub de l'éditeur (site publié).
 *
 * Les fiches vivent chiffrées dans le dossier « sources/ » du dépôt :
 * « sources/fiches/3fa2c1.md.enc », « sources/categories.yml.enc »… Le
 * navigateur les déchiffre et les chiffre avec la clé de la session (celle
 * que le mot de passe a dérivée), si bien que le dépôt public ne contient
 * jamais une ligne en clair, et que les messages de commit restent neutres.
 *
 * Chaque enregistrement est UN commit (API Git Data), qui déclenche la
 * publication automatique (GitHub Actions) : déchiffrement, build, Pages.
 *
 * Le jeton d'accès (fine-grained, limité à ce dépôt) est conservé dans le
 * navigateur, chiffré lui aussi avec la clé de la session.
 */
import { openDB, type IDBPDatabase } from 'idb';
import config from '../../../site.config.mjs';
import { obtenirCle } from '../auth';
import { chiffrerTexte, dechiffrerTexte } from '../crypto';
import type { Depot, EtatPublication, FichierSource } from './depot';
import categoriesParDefaut from '../../../content-exemple/categories.yml?raw';
import glossaireParDefaut from '../../../content-exemple/glossaire.yml?raw';

export interface ConfigurationDepot {
  proprietaire: string;
  nom: string;
  branche: string;
  jeton: string;
}

const CLE_CONFIGURATION = 'revision.depot-github';
const PREFIXE = 'sources/';
const SUFFIXE = '.enc';
const API = 'https://api.github.com';

/* ══════════════════════════════════════════════════════════════════════════
   Configuration, chiffrée dans le navigateur
   ══════════════════════════════════════════════════════════════════════════ */

export const configurationParDefaut = (): Omit<ConfigurationDepot, 'jeton'> => ({ ...config.depot });

export async function lireConfiguration(): Promise<ConfigurationDepot | null> {
  const cle = await obtenirCle();
  if (!cle) return null;
  try {
    const brut = localStorage.getItem(CLE_CONFIGURATION);
    if (!brut) return null;
    return JSON.parse(await dechiffrerTexte(cle, brut)) as ConfigurationDepot;
  } catch {
    return null;
  }
}

export async function enregistrerConfiguration(c: ConfigurationDepot) {
  const cle = await obtenirCle();
  if (!cle) throw new Error('Session verrouillée.');
  localStorage.setItem(CLE_CONFIGURATION, await chiffrerTexte(cle, JSON.stringify(c)));
}

export function oublierConfiguration() {
  try {
    localStorage.removeItem(CLE_CONFIGURATION);
  } catch {
    /* ignoré */
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Appels à l'API
   ══════════════════════════════════════════════════════════════════════════ */

export class ErreurGitHub extends Error {
  constructor(
    message: string,
    readonly statut: number,
  ) {
    super(message);
  }
}

async function appeler<T>(c: ConfigurationDepot, chemin: string, init: RequestInit = {}): Promise<T> {
  const reponse = await fetch(`${API}${chemin}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${c.jeton}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!reponse.ok) {
    let detail = '';
    try {
      detail = (await reponse.json())?.message ?? '';
    } catch {
      /* corps vide */
    }
    const messages: Record<number, string> = {
      401: 'jeton GitHub refusé (expiré ou révoqué) : reconfigurez l\'éditeur.',
      403:
        'accès refusé : le jeton n\'a pas le droit d\'écrire dans ce dépôt. Sur GitHub, modifiez le jeton : ' +
        'permission « Contents » sur « Read and write ».',
      404: 'dépôt ou branche introuvable, ou jeton sans accès à ce dépôt.',
    };
    throw new ErreurGitHub(messages[reponse.status] ?? `GitHub a répondu ${reponse.status} ${detail}`, reponse.status);
  }
  return (reponse.status === 204 ? null : await reponse.json()) as T;
}

const depotChemin = (c: ConfigurationDepot) =>
  `/repos/${encodeURIComponent(c.proprietaire)}/${encodeURIComponent(c.nom)}`;

/** Vérifie la configuration : le dépôt existe et le jeton peut y écrire. */
export async function testerConfiguration(c: ConfigurationDepot): Promise<void> {
  const depot = await appeler<{ permissions?: { push?: boolean }; default_branch: string }>(c, depotChemin(c));
  if (depot.permissions && depot.permissions.push === false) {
    throw new Error('Ce jeton ne permet pas d\'écrire dans le dépôt.');
  }
  await appeler(c, `${depotChemin(c)}/branches/${encodeURIComponent(c.branche)}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   Cache des fichiers chiffrés, par empreinte Git
   ══════════════════════════════════════════════════════════════════════════
   Seul le texte CHIFFRÉ est mis en cache : l'ouverture de l'éditeur ne
   retélécharge que ce qui a changé, sans que des fiches en clair restent
   stockées sur l'appareil. */

let base: Promise<IDBPDatabase> | null = null;
const cache = () => (base ??= openDB('revision-editeur', 1, { upgrade: (b) => b.createObjectStore('blobs') }));

async function lireBlob(c: ConfigurationDepot, sha: string): Promise<string> {
  try {
    const enCache = (await (await cache()).get('blobs', sha)) as string | undefined;
    if (enCache) return enCache;
  } catch {
    /* pas de cache disponible : on télécharge */
  }
  const blob = await appeler<{ content: string; encoding: string }>(c, `${depotChemin(c)}/git/blobs/${sha}`);
  const texte =
    blob.encoding === 'base64'
      ? new TextDecoder().decode(Uint8Array.from(atob(blob.content.replace(/\n/g, '')), (ch) => ch.charCodeAt(0)))
      : blob.content;
  try {
    await (await cache()).put('blobs', texte, sha);
  } catch {
    /* ignoré */
  }
  return texte;
}

/** Exécute des tâches avec un nombre limité de requêtes simultanées. */
async function enParallele<T, R>(elements: T[], limite: number, tache: (e: T) => Promise<R>): Promise<R[]> {
  const resultats: R[] = new Array(elements.length);
  let suivant = 0;
  const ouvriers = Array.from({ length: Math.min(limite, elements.length) }, async () => {
    while (suivant < elements.length) {
      const i = suivant++;
      resultats[i] = await tache(elements[i]);
    }
  });
  await Promise.all(ouvriers);
  return resultats;
}

/* ══════════════════════════════════════════════════════════════════════════
   Le dépôt
   ══════════════════════════════════════════════════════════════════════════ */

interface EntreeArbre {
  path: string;
  type: string;
  sha: string;
}

export class DepotGitHub implements Depot {
  readonly nom = 'github' as const;
  readonly description: string;
  private dernierCommit: string | null = null;

  constructor(private readonly c: ConfigurationDepot) {
    this.description = `dépôt GitHub ${c.proprietaire}/${c.nom}, fiches chiffrées`;
  }

  private async cle(): Promise<CryptoKey> {
    const cle = await obtenirCle();
    if (!cle) throw new Error('Session verrouillée : ressaisissez le mot de passe.');
    return cle;
  }

  async lister(): Promise<FichierSource[]> {
    const cle = await this.cle();
    const arbre = await appeler<{ tree: EntreeArbre[]; truncated: boolean }>(
      this.c,
      `${depotChemin(this.c)}/git/trees/${encodeURIComponent(this.c.branche)}?recursive=1`,
    );
    if (arbre.truncated) throw new Error('Dépôt trop volumineux pour être lu en une fois.');
    const entrees = arbre.tree.filter((e) => e.type === 'blob' && e.path.startsWith(PREFIXE) && e.path.endsWith(SUFFIXE));

    const fichiers = await enParallele(entrees, 8, async (e) => {
      const enveloppe = await lireBlob(this.c, e.sha);
      let contenu: string;
      try {
        contenu = await dechiffrerTexte(cle, enveloppe);
      } catch {
        throw new Error(
          `« ${e.path} » ne se déchiffre pas avec le mot de passe de cette session : ` +
            'le site a-t-il changé de mot de passe ?',
        );
      }
      return { chemin: e.path.slice(PREFIXE.length, -SUFFIXE.length), contenu };
    });

    // Tant qu'ils n'ont jamais été enregistrés depuis l'éditeur, l'arborescence
    // et le glossaire sont ceux de départ — les mêmes que la publication utilise.
    if (!fichiers.some((f) => f.chemin === 'categories.yml')) fichiers.push({ chemin: 'categories.yml', contenu: categoriesParDefaut });
    if (!fichiers.some((f) => f.chemin === 'glossaire.yml')) fichiers.push({ chemin: 'glossaire.yml', contenu: glossaireParDefaut });
    return fichiers;
  }

  /** Un commit unique : écritures (contenu) et suppressions (null). */
  private async commit(changements: { chemin: string; contenu: string | null }[], message: string) {
    const cle = await this.cle();
    const entrees = await Promise.all(
      changements.map(async (ch) => ({
        path: `${PREFIXE}${ch.chemin}${SUFFIXE}`,
        mode: '100644',
        type: 'blob',
        ...(ch.contenu === null ? { sha: null } : { content: await chiffrerTexte(cle, ch.contenu) }),
      })),
    );
    const d = depotChemin(this.c);
    const ref = `heads/${encodeURIComponent(this.c.branche)}`;

    // Deux tentatives : si un autre appareil a poussé entre-temps, la mise à
    // jour de la branche est refusée (pas d'avance rapide) ; on repart alors
    // du nouveau sommet.
    for (let essai = 0; essai < 2; essai++) {
      const tete = await appeler<{ object: { sha: string } }>(this.c, `${d}/git/ref/${ref}`);
      const commitParent = await appeler<{ tree: { sha: string } }>(this.c, `${d}/git/commits/${tete.object.sha}`);
      const arbre = await appeler<{ sha: string }>(this.c, `${d}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({ base_tree: commitParent.tree.sha, tree: entrees }),
      });
      const commit = await appeler<{ sha: string }>(this.c, `${d}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message, tree: arbre.sha, parents: [tete.object.sha] }),
      });
      try {
        await appeler(this.c, `${d}/git/refs/${ref}`, {
          method: 'PATCH',
          body: JSON.stringify({ sha: commit.sha, force: false }),
        });
        this.dernierCommit = commit.sha;
        return;
      } catch (e) {
        if (!(e instanceof ErreurGitHub) || e.statut !== 422 || essai === 1) throw e;
      }
    }
  }

  async ecrire(chemin: string, contenu: string, message: string) {
    await this.commit([{ chemin, contenu }], message);
  }

  async ecrirePlusieurs(fichiers: FichierSource[], message: string) {
    if (fichiers.length) await this.commit(fichiers, message);
  }

  async supprimer(chemin: string, message: string) {
    await this.commit([{ chemin, contenu: null }], message);
  }

  async publication(): Promise<EtatPublication> {
    try {
      const { workflow_runs: runs } = await appeler<{
        workflow_runs: { head_sha: string; status: string; conclusion: string | null; html_url: string }[];
      }>(this.c, `${depotChemin(this.c)}/actions/runs?branch=${encodeURIComponent(this.c.branche)}&per_page=10`);
      const run = this.dernierCommit ? runs.find((r) => r.head_sha === this.dernierCommit) : runs[0];
      if (!run) return { etat: this.dernierCommit ? 'en-cours' : 'inconnu' };
      if (run.status !== 'completed') return { etat: 'en-cours' };
      if (run.conclusion === 'success') return { etat: 'prete' };
      return { etat: 'erreur', message: `Publication en échec (${run.conclusion}) : ${run.html_url}` };
    } catch (e) {
      return { etat: 'inconnu', message: e instanceof Error ? e.message : String(e) };
    }
  }
}

export async function depotGitHubConfigure(): Promise<Depot | null> {
  const c = await lireConfiguration();
  return c ? new DepotGitHub(c) : null;
}
