/**
 * Synchronisation automatique de la progression entre appareils.
 *
 * La progression vit dans le navigateur (IndexedDB). Pour la partager, une
 * copie chiffrée (AES-256, clé de la session) et compressée est rangée dans le
 * dépôt GitHub, dans « progression/progression.json.enc », avec le jeton de
 * l'éditeur. Ce dossier est exclu de la publication : une synchronisation ne
 * relance pas la construction du site.
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
import { CLE_REINITIALISATION, exporterTout, importerTout, type ExportProgression } from './db';
import { appeler, depotChemin, ErreurGitHub, lireConfiguration, type ConfigurationDepot } from './editeur/depot-github';
import { estVide, extraireBase, fusionner, texteStable, type BaseFusion } from './synchro-fusion';
import { notifier } from './ui';

const CHEMIN = 'progression/progression.json.enc';
const CLE_ETAT = 'revision.synchro';
export const EVENEMENT_SYNCHRO = 'revision:synchro';

/** Intervalle minimal entre deux envois pendant qu'on révise (un envoi = un commit). */
const DELAI_ENVOI = 2 * 60_000;
const DELAI_VERIFICATION_LOCALE = 20_000;
const DELAI_VERIFICATION_DISTANTE = 5 * 60_000;

interface EtatSynchro {
  /** Empreinte Git de la copie du dépôt à la dernière synchronisation. */
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

async function chiffrer(cle: CryptoKey, copie: CopieDistante): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clair = gzipSync(strToU8(JSON.stringify(copie)), { level: 9 });
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cle, clair as BufferSource);
  return JSON.stringify({ v: 2, gz: true, iv: versBase64(iv), ct: versBase64(new Uint8Array(chiffre)) }) + '\n';
}

async function dechiffrer(cle: CryptoKey, enveloppe: string): Promise<CopieDistante> {
  const { iv, ct } = JSON.parse(enveloppe) as { iv: string; ct: string };
  const clair = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: depuisBase64(iv) as BufferSource },
    cle,
    depuisBase64(ct) as BufferSource,
  );
  const copie = JSON.parse(strFromU8(gunzipSync(new Uint8Array(clair)))) as CopieDistante;
  if (copie?.format !== 'revision-synchro') throw new Error('Copie de progression illisible.');
  return copie;
}

/* ── Dépôt ────────────────────────────────────────────────────────────────── */

async function lireDistant(c: ConfigurationDepot): Promise<{ sha: string; enveloppe: string } | null> {
  let meta: { sha: string; content?: string; encoding?: string };
  try {
    meta = await appeler(c, `${depotChemin(c)}/contents/${CHEMIN}?ref=${encodeURIComponent(c.branche)}`);
  } catch (e) {
    if (e instanceof ErreurGitHub && e.statut === 404) return null;
    throw e;
  }
  // Au-delà d'un mégaoctet, l'API ne renvoie pas le contenu : on passe par le blob.
  let b64 = meta.encoding === 'base64' ? meta.content : undefined;
  if (!b64) {
    b64 = (await appeler<{ content: string }>(c, `${depotChemin(c)}/git/blobs/${meta.sha}`)).content;
  }
  return { sha: meta.sha, enveloppe: strFromU8(depuisBase64(b64)) };
}

class ConflitEnvoi extends Error {}

async function envoyerDistant(c: ConfigurationDepot, enveloppe: string, sha: string | null): Promise<string> {
  try {
    const r = await appeler<{ content: { sha: string } }>(c, `${depotChemin(c)}/contents/${CHEMIN}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Synchronise la progression',
        content: btoa(enveloppe),
        branch: c.branche,
        ...(sha ? { sha } : {}),
      }),
    });
    return r.content.sha;
  } catch (e) {
    // Un autre appareil a envoyé entre-temps : il faut repartir de sa copie.
    if (e instanceof ErreurGitHub && (e.statut === 409 || e.statut === 422)) throw new ConflitEnvoi();
    throw e;
  }
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
  const distantBrut = await lireDistant(c);
  const distant = distantBrut ? await dechiffrer(cle, distantBrut.enveloppe) : null;

  const localModifie = !etat || etat.empreinte !== empreinteLocale;
  const distantModifie = Boolean(distantBrut) && (!etat || etat.sha !== distantBrut!.sha);
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

  let sha = distantBrut?.sha ?? null;
  if (aEnvoyer) {
    const copie: CopieDistante = {
      format: 'revision-synchro',
      version: 1,
      envoyeLe: new Date().toISOString(),
      reinitialiseeLe: reinitConnue,
      donnees: resultat,
    };
    try {
      sha = await envoyerDistant(c, await chiffrer(cle, copie), sha);
    } catch (e) {
      if (e instanceof ConflitEnvoi && essai === 0) return executer(1);
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
