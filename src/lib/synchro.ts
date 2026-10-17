/**
 * Synchronisation automatique de la progression entre appareils.
 *
 * La progression vit dans le navigateur (IndexedDB). Pour la partager, une
 * copie chiffrée (AES-256, clé de la session) et compressée est rangée dans le
 * dossier « progression/ » du dépôt GitHub, avec le jeton de l'éditeur. Ce
 * dossier est exclu de la publication : une synchronisation ne relance pas la
 * construction du site.
 *
 * L'historique des révisions grossit sans cesse ; pour que chaque envoi reste
 * léger, les mois passés sont archivés à part (« revlog-AAAA-MM.json.enc »), et
 * un fichier d'archive n'est réécrit que si son contenu change. Le fichier
 * principal (« progression.json.enc ») porte l'état et le mois en cours. Tous
 * les fichiers d'un envoi partent dans un seul commit.
 *
 * À chaque synchronisation, on compare deux choses à la dernière
 * synchronisation réussie de cet appareil :
 *  - la copie du dépôt a-t-elle changé (son empreinte Git) ?
 *  - la progression de cet appareil a-t-elle changé (empreinte de son contenu) ?
 *
 *  Seul cet appareil a changé  → on envoie sa copie.
 *  Seul le dépôt a changé      → on la reprend ici.
 *  Les deux ont changé         → on fusionne : pour chaque élément, l'état le
 *                                plus récent (voir synchro-fusion.ts).
 *  Contradiction nette         → on demande. C'est le cas d'une remise à zéro
 *                                d'un côté pendant que l'autre progressait :
 *                                fusionner ferait revenir ce qui a été effacé.
 */
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { obtenirCle } from './auth';
import { sha256Hex } from './crypto';
import { CLE_REINITIALISATION, exporterTout, importerTout, type EntreeRevlog, type ExportProgression } from './db';
import {
  appeler,
  depotChemin,
  ErreurGitHub,
  lireBlob,
  lireConfiguration,
  type ConfigurationDepot,
} from './editeur/depot-github';
import { estVide, extraireBase, fusionner, texteStable, type BaseFusion } from './synchro-fusion';
import { notifier } from './ui';

const DOSSIER = 'progression';
const PRINCIPAL = 'progression.json.enc';
const archive = (mois: string) => `revlog-${mois}.json.enc`;
const MOTIF_ARCHIVE = /^revlog-(\d{4}-\d{2})\.json\.enc$/;
const CLE_ETAT = 'revision.synchro';
export const EVENEMENT_SYNCHRO = 'revision:synchro';

/** Intervalle minimal entre deux envois pendant qu'on révise (un envoi = un commit). */
const DELAI_ENVOI = 5 * 60_000;
const DELAI_VERIFICATION_LOCALE = 20_000;
const DELAI_VERIFICATION_DISTANTE = 5 * 60_000;

interface EtatSynchro {
  /** Signature des fichiers du dépôt (noms et empreintes Git) à la dernière synchronisation. */
  sha: string | null;
  /** Empreinte de la progression locale à la dernière synchronisation. */
  empreinte: string;
  synchroLe: string;
  base: BaseFusion;
}

interface CopieDistante {
  format: 'revision-synchro';
  version: 1;
  envoyeLe: string;
  /** Dernière remise à zéro connue, tous appareils confondus. */
  reinitialiseeLe: string | null;
  donnees: ExportProgression;
}

export type StatutSynchro =
  | { etat: 'inactive'; message: string }
  | { etat: 'en-cours' }
  | { etat: 'ok'; le: string; message: string }
  | { etat: 'erreur'; message: string };

let statut: StatutSynchro = { etat: 'en-cours' };
export const statutSynchro = () => statut;

function annoncer(s: StatutSynchro) {
  statut = s;
  document.dispatchEvent(new CustomEvent(EVENEMENT_SYNCHRO, { detail: s }));
}

/* ── Stockage local ───────────────────────────────────────────────────────── */

function lireEtat(): EtatSynchro | null {
  try {
    const brut = localStorage.getItem(CLE_ETAT);
    return brut ? (JSON.parse(brut) as EtatSynchro) : null;
  } catch {
    return null;
  }
}

function ecrireEtat(e: EtatSynchro) {
  try {
    localStorage.setItem(CLE_ETAT, JSON.stringify(e));
  } catch {
    /* navigation privée : on resynchronisera entièrement la prochaine fois */
  }
}

function reinitialisationLocale(): string | null {
  try {
    return localStorage.getItem(CLE_REINITIALISATION);
  } catch {
    return null;
  }
}

/* ── Chiffrement : JSON → gzip → AES-GCM → base64 ─────────────────────────── */

function versBase64(octets: Uint8Array): string {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) {
    binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(binaire);
}

function depuisBase64(b64: string): Uint8Array {
  const binaire = atob(b64.replace(/\s/g, ''));
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

async function chiffrer(cle: CryptoKey, objet: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clair = gzipSync(strToU8(JSON.stringify(objet)), { level: 9 });
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cle, clair as BufferSource);
  return JSON.stringify({ v: 2, gz: true, iv: versBase64(iv), ct: versBase64(new Uint8Array(chiffre)) }) + '\n';
}

async function dechiffrer<T>(cle: CryptoKey, enveloppe: string): Promise<T> {
  const { iv, ct } = JSON.parse(enveloppe) as { iv: string; ct: string };
  const clair = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: depuisBase64(iv) as BufferSource },
    cle,
    depuisBase64(ct) as BufferSource,
  );
  return JSON.parse(strFromU8(gunzipSync(new Uint8Array(clair)))) as T;
}

/** Mois local d'une révision, « AAAA-MM ». */
function moisDe(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Empreinte du contenu d'une archive, pour ne la réécrire que si elle change. */
const empreinteArchive = (entrees: EntreeRevlog[]) =>
  sha256Hex(JSON.stringify([...entrees].sort((a, b) => a.id.localeCompare(b.id))));

/* ── Dépôt ────────────────────────────────────────────────────────────────── */

interface Distant {
  /** Commit sur lequel la lecture a été faite : l'envoi s'y raccroche. */
  tete: string;
  signature: string;
  copie: CopieDistante;
  /** Empreinte du contenu de chaque archive mensuelle lue. */
  archives: Map<string, string>;
}

async function teteBranche(c: ConfigurationDepot): Promise<string> {
  const ref = await appeler<{ object: { sha: string } }>(
    c,
    `${depotChemin(c)}/git/ref/heads/${encodeURIComponent(c.branche)}`,
  );
  return ref.object.sha;
}

async function lireDistant(c: ConfigurationDepot, cle: CryptoKey): Promise<Distant | { tete: string; vide: true }> {
  const tete = await teteBranche(c);
  let fichiers: { name: string; sha: string; type: string }[];
  try {
    fichiers = await appeler(c, `${depotChemin(c)}/contents/${DOSSIER}?ref=${tete}`);
  } catch (e) {
    if (e instanceof ErreurGitHub && e.statut === 404) return { tete, vide: true };
    throw e;
  }
  const principal = fichiers.find((f) => f.name === PRINCIPAL);
  if (!principal) return { tete, vide: true };
  const utiles = fichiers.filter((f) => f.name === PRINCIPAL || MOTIF_ARCHIVE.test(f.name));
  const signature = utiles
    .map((f) => `${f.name}:${f.sha}`)
    .sort()
    .join(',');

  const copie = await dechiffrer<CopieDistante>(cle, await lireBlob(c, principal.sha));
  if (copie?.format !== 'revision-synchro') throw new Error('Copie de progression illisible.');
  const revlog: EntreeRevlog[] = [...(copie.donnees.revlog ?? [])];
  const archives = new Map<string, string>();
  for (const f of utiles) {
    const mois = MOTIF_ARCHIVE.exec(f.name)?.[1];
    if (!mois) continue;
    // Les archives sont mises en cache par empreinte : seules les nouvelles se téléchargent.
    const entrees = await dechiffrer<EntreeRevlog[]>(cle, await lireBlob(c, f.sha));
    archives.set(mois, await empreinteArchive(entrees));
    revlog.push(...entrees);
  }
  copie.donnees = { ...copie.donnees, revlog };
  return { tete, signature, copie, archives };
}

class ConflitEnvoi extends Error {}

/** Envoie la copie en un commit et retourne la nouvelle signature du dossier. */
async function envoyerDistant(
  c: ConfigurationDepot,
  cle: CryptoKey,
  tete: string,
  copie: CopieDistante,
  archivesDistantes: Map<string, string>,
): Promise<string> {
  // Les mois passés à part, le mois en cours dans le fichier principal.
  const courant = moisDe(new Date().toISOString());
  const parMois = new Map<string, EntreeRevlog[]>();
  const recentes: EntreeRevlog[] = [];
  for (const e of copie.donnees.revlog ?? []) {
    const mois = moisDe(e.le);
    if (mois >= courant) recentes.push(e);
    else {
      const liste = parMois.get(mois);
      if (liste) liste.push(e);
      else parMois.set(mois, [e]);
    }
  }
  const fichiers: { path: string; content: string }[] = [];
  for (const [mois, entrees] of parMois) {
    if (archivesDistantes.get(mois) === (await empreinteArchive(entrees))) continue;
    fichiers.push({ path: `${DOSSIER}/${archive(mois)}`, content: await chiffrer(cle, entrees) });
  }
  const principal = { ...copie, donnees: { ...copie.donnees, revlog: recentes } };
  fichiers.push({ path: `${DOSSIER}/${PRINCIPAL}`, content: await chiffrer(cle, principal) });

  const d = depotChemin(c);
  const parent = await appeler<{ tree: { sha: string } }>(c, `${d}/git/commits/${tete}`);
  const arbre = await appeler<{ sha: string }>(c, `${d}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: fichiers.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
    }),
  });
  const commit = await appeler<{ sha: string }>(c, `${d}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: 'Synchronise la progression', tree: arbre.sha, parents: [tete] }),
  });
  try {
    // Sans forcer : si la branche a bougé depuis la lecture (autre appareil,
    // fiche enregistrée), GitHub refuse, et l'on recommence depuis le début.
    await appeler(c, `${d}/git/refs/heads/${encodeURIComponent(c.branche)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } catch (e) {
    if (e instanceof ErreurGitHub && (e.statut === 409 || e.statut === 422)) throw new ConflitEnvoi();
    throw e;
  }
  // Signature après envoi : celle du dossier dans le nouveau commit.
  const contenu = await appeler<{ name: string; sha: string }[]>(c, `${d}/contents/${DOSSIER}?ref=${commit.sha}`);
  return contenu
    .filter((f) => f.name === PRINCIPAL || MOTIF_ARCHIVE.test(f.name))
    .map((f) => `${f.name}:${f.sha}`)
    .sort()
    .join(',');
}

/* ── Contradiction : on demande ───────────────────────────────────────────── */

type Choix = 'local' | 'distant' | 'fusion';

function demander(question: string, explication: string): Promise<Choix> {
  return new Promise((resoudre) => {
    const fond = document.createElement('div');
    fond.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4';
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    const boite = document.createElement('div');
    boite.className =
      'w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900';
    const titre = document.createElement('h2');
    titre.className = 'mb-2 text-lg font-semibold text-slate-900 dark:text-white';
    titre.textContent = question;
    const texte = document.createElement('p');
    texte.className = 'mb-4 text-sm text-slate-600 dark:text-slate-300';
    texte.textContent = explication;
    boite.append(titre, texte);
    const options: [Choix, string, string][] = [
      ['local', 'Garder la progression de cet appareil', 'bg-indigo-600 text-white hover:bg-indigo-700'],
      ['distant', "Garder celle de l'autre appareil", 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'],
      ['fusion', 'Fusionner les deux', 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'],
    ];
    for (const [choix, libelle, couleurs] of options) {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = `mb-2 block w-full rounded-lg px-4 py-2.5 text-sm font-medium transition ${couleurs}`;
      bouton.textContent = libelle;
      bouton.addEventListener('click', () => {
        fond.remove();
        resoudre(choix);
      });
      boite.append(bouton);
    }
    fond.append(boite);
    document.body.append(fond);
  });
}

/* ── La synchronisation ───────────────────────────────────────────────────── */

const empreinte = async (d: ExportProgression) => sha256Hex(texteStable(d));
let enCours: Promise<void> | null = null;
let dernierEnvoi = 0;
let interaction = false;
/** Vrai quand la base locale vient d'être réécrite avec une copie reçue. */
let recue = false;

async function appliquerLocalement(d: ExportProgression) {
  await importerTout(d, 'remplacement');
  recue = true;
}

/** Affiche la progression reçue, une fois l'état de synchronisation enregistré. */
function signalerReception() {
  if (!recue) return;
  recue = false;
  // Juste après l'ouverture, on recharge pour afficher la progression reçue ;
  // en pleine révision, on se contente de prévenir. Si l'état n'a pas pu être
  // enregistré (navigation privée), on ne recharge pas : ce serait sans fin.
  if (!interaction && performance.now() < 15_000 && lireEtat()) location.reload();
  else notifier("Progression mise à jour depuis l'autre appareil", 'succes');
}

async function executer(essai = 0): Promise<void> {
  const c = await lireConfiguration();
  const cle = await obtenirCle();
  if (!c || !cle) {
    annoncer({
      etat: 'inactive',
      message: "Synchronisation inactive sur cet appareil : connectez l'éditeur avec votre jeton GitHub.",
    });
    return;
  }
  annoncer({ etat: 'en-cours' });

  const etat = lireEtat();
  const local = await exporterTout();
  const empreinteLocale = await empreinte(local);
  const lu = await lireDistant(c, cle);
  const distantBrut = 'vide' in lu ? null : lu;
  const distant = distantBrut?.copie ?? null;

  const localModifie = !etat || etat.empreinte !== empreinteLocale;
  const distantModifie = Boolean(distantBrut) && (!etat || etat.sha !== distantBrut!.signature);
  const reinitLocale = reinitialisationLocale();
  const reinitConnue = [reinitLocale, distant?.reinitialiseeLe].filter(Boolean).sort().pop() ?? null;

  let resultat: ExportProgression = local;
  let aEnvoyer = false;
  let message = 'À jour';

  if (!distant) {
    aEnvoyer = true;
  } else if (!distantModifie) {
    aEnvoyer = localModifie;
  } else if (!localModifie || estVide(local)) {
    resultat = distant.donnees;
    await appliquerLocalement(resultat);
    message = "Progression reçue de l'autre appareil";
  } else {
    // Les deux copies ont évolué depuis la dernière synchronisation.
    const depuis = etat?.synchroLe ?? '';
    const effaceeIci = Boolean(reinitLocale && reinitLocale > depuis) && !estVide(distant.donnees);
    const effaceeLaBas = Boolean(distant.reinitialiseeLe && distant.reinitialiseeLe > depuis) && !estVide(local);
    let choix: Choix = 'fusion';
    if (effaceeIci || effaceeLaBas) {
      choix = await demander(
        'Deux progressions contradictoires',
        effaceeIci
          ? "Vous avez remis la progression à zéro sur cet appareil, mais l'autre appareil a continué à progresser depuis la dernière synchronisation. Laquelle conserver ?"
          : "La progression a été remise à zéro sur l'autre appareil, mais celui-ci a continué à progresser depuis la dernière synchronisation. Laquelle conserver ?",
      );
    }
    if (choix === 'distant') {
      resultat = distant.donnees;
      await appliquerLocalement(resultat);
      message = "Progression de l'autre appareil conservée";
    } else {
      if (choix === 'fusion') {
        resultat = fusionner(local, distant.donnees, etat?.base ?? null);
        await appliquerLocalement(resultat);
        message = 'Progressions des deux appareils fusionnées';
      }
      aEnvoyer = true;
    }
  }

  let sha = distantBrut?.signature ?? null;
  if (aEnvoyer) {
    const copie: CopieDistante = {
      format: 'revision-synchro',
      version: 1,
      envoyeLe: new Date().toISOString(),
      reinitialiseeLe: reinitConnue,
      donnees: resultat,
    };
    try {
      sha = await envoyerDistant(c, cle, lu.tete, copie, distantBrut?.archives ?? new Map());
    } catch (e) {
      if (e instanceof ConflitEnvoi && essai < 2) return executer(essai + 1);
      throw e;
    }
    dernierEnvoi = Date.now();
    if (message === 'À jour') message = 'Progression envoyée';
  }

  // La base et l'empreinte décrivent ce que les deux côtés ont désormais en commun.
  const apres = resultat === local ? local : await exporterTout();
  ecrireEtat({
    sha,
    empreinte: resultat === local ? empreinteLocale : await empreinte(apres),
    synchroLe: new Date().toISOString(),
    base: extraireBase(apres),
  });
  annoncer({ etat: 'ok', le: new Date().toISOString(), message });
  signalerReception();
}

/** Lance une synchronisation (une seule à la fois). */
export function synchroniser(): Promise<void> {
  enCours ??= executer()
    .catch((e) => {
      recue = false;
      annoncer({ etat: 'erreur', message: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => {
      enCours = null;
    });
  return enCours;
}

async function localAChange(): Promise<boolean> {
  const etat = lireEtat();
  if (!etat) return true;
  return etat.empreinte !== (await empreinte(await exporterTout()));
}

let demarree = false;

/** À appeler une fois la session ouverte, sur chaque page. */
export function demarrerSynchro() {
  if (demarree) return;
  demarree = true;
  const noterInteraction = () => (interaction = true);
  addEventListener('pointerdown', noterInteraction, { once: true, capture: true });
  addEventListener('keydown', noterInteraction, { once: true, capture: true });

  void synchroniser();

  // Pendant la révision : envoi des changements, au plus toutes les deux minutes.
  setInterval(async () => {
    if (document.visibilityState !== 'visible' || enCours) return;
    if (Date.now() - dernierEnvoi < DELAI_ENVOI) return;
    if (statut.etat === 'inactive') return;
    if (await localAChange()) void synchroniser();
  }, DELAI_VERIFICATION_LOCALE);

  // Changements faits sur l'autre appareil pendant que celui-ci reste ouvert.
  setInterval(() => {
    if (document.visibilityState === 'visible' && statut.etat !== 'inactive') void synchroniser();
  }, DELAI_VERIFICATION_DISTANTE);

  // On quitte l'application (ou on change d'appli sur le téléphone) : envoi ;
  // on y revient : réception.
  document.addEventListener('visibilitychange', () => {
    if (statut.etat !== 'inactive') void synchroniser();
  });
}
