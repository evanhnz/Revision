/**
 * Où l'éditeur lit et écrit les fichiers sources.
 *
 * Deux implémentations derrière la même interface :
 *  - « local », pendant « npm run dev » : les fichiers de content/, en clair,
 *    via le greffon Vite « scripts/lib/depot-local.mjs » ;
 *  - « github », sur le site publié : le dépôt GitHub, fichiers chiffrés
 *    (voir « depot-github.ts »).
 *
 * Les chemins sont relatifs à content/ : « fiches/3fa2c1.md »,
 * « categories.yml », « glossaire.yml ».
 */
export interface FichierSource {
  chemin: string;
  contenu: string;
}

export interface EtatPublication {
  /** « prete » : le site affiche la dernière version enregistrée. */
  etat: 'prete' | 'en-cours' | 'erreur' | 'inconnu';
  message?: string;
}

export interface Depot {
  readonly nom: 'local' | 'github';
  /** Libellé pour l'interface : où vont les enregistrements. */
  readonly description: string;
  lister(): Promise<FichierSource[]>;
  ecrire(chemin: string, contenu: string, message: string): Promise<void>;
  /** Plusieurs fichiers d'un coup (déplacement d'une catégorie, import). */
  ecrirePlusieurs(fichiers: FichierSource[], message: string): Promise<void>;
  supprimer(chemin: string, message: string): Promise<void>;
  publication(): Promise<EtatPublication>;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

async function verifier(reponse: Response) {
  if (reponse.ok) return reponse;
  let detail = `${reponse.status} ${reponse.statusText}`;
  try {
    const corps = await reponse.json();
    if (corps?.erreur) detail = corps.erreur;
  } catch {
    /* corps non JSON : on garde le statut HTTP */
  }
  throw new Error(detail);
}

export class DepotLocal implements Depot {
  readonly nom = 'local' as const;
  readonly description = 'dossier content/ de cet ordinateur (mode développement)';

  async lister(): Promise<FichierSource[]> {
    const r = await verifier(await fetch(`${base}/__depot/liste`, { cache: 'no-store' }));
    return r.json();
  }

  async ecrire(chemin: string, contenu: string) {
    await verifier(
      await fetch(`${base}/__depot/fichier?chemin=${encodeURIComponent(chemin)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: contenu,
      }),
    );
  }

  async ecrirePlusieurs(fichiers: FichierSource[]) {
    for (const f of fichiers) await this.ecrire(f.chemin, f.contenu);
  }

  async supprimer(chemin: string) {
    await verifier(
      await fetch(`${base}/__depot/fichier?chemin=${encodeURIComponent(chemin)}`, { method: 'DELETE' }),
    );
  }

  async publication(): Promise<EtatPublication> {
    try {
      const r = await verifier(await fetch(`${base}/__depot/etat`, { cache: 'no-store' }));
      const { reconstruction, message } = await r.json();
      return { etat: reconstruction, message };
    } catch (e) {
      return { etat: 'inconnu', message: e instanceof Error ? e.message : String(e) };
    }
  }
}

/** Le dépôt disponible ici : local en développement, GitHub en ligne. */
export async function obtenirDepot(): Promise<Depot> {
  if (import.meta.env.DEV) return new DepotLocal();
  const { depotGitHubConfigure } = await import('./depot-github');
  const depot = await depotGitHubConfigure();
  if (!depot) throw new DepotNonConfigure();
  return depot;
}

export class DepotNonConfigure extends Error {
  constructor() {
    super('Aucun dépôt GitHub configuré pour l\'éditeur.');
  }
}
