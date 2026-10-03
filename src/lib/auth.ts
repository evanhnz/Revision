/**
 * Écran de connexion et gestion de la clé de déchiffrement.
 *
 * Deux mécanismes complémentaires, comme prévu :
 *  1. la saisie du mot de passe est vérifiée par comparaison SHA-256 ;
 *  2. la même saisie sert à dériver la clé AES qui déchiffre réellement le
 *     contenu — sans elle, les fichiers publiés restent illisibles.
 *
 * La clé dérivée peut être mémorisée pour éviter de retaper le mot de passe :
 *  - par défaut dans sessionStorage (effacée à la fermeture de l'onglet) ;
 *  - dans localStorage si l'utilisateur coche « rester connecté ».
 */
import config from '../../site.config.mjs';
import {
  cleValide,
  deriverCle,
  exporterCle,
  importerCle,
  sha256Hex,
  type ParametresCle,
} from './crypto';
import { chargerParametresCle, viderCache } from './contenu';

const CLE_STOCKAGE = 'revinsp.cle';
// Vide si aucune empreinte n'est fournie : le témoin chiffré fait alors foi.
const HASH_ATTENDU = (
  (import.meta.env.PUBLIC_MOT_DE_PASSE_HASH as string | undefined) ||
  (config as { motDePasseHash: string }).motDePasseHash ||
  ''
).toLowerCase();

/** Nom de l'événement annonçant que le contenu peut être déchiffré. */
export const EVENEMENT_DEVERROUILLE = 'revinsp:deverrouille';

let cleMemoire: CryptoKey | null = null;
const abonnes = new Set<(deverrouille: boolean) => void>();

// La mise en cache est assurée par contenu.ts : une seule source de vérité
// pour les paramètres publics et le numéro de publication.
const params = (): Promise<ParametresCle> => chargerParametresCle();

function lireStockage(): string | null {
  try {
    return sessionStorage.getItem(CLE_STOCKAGE) ?? localStorage.getItem(CLE_STOCKAGE);
  } catch {
    return null;
  }
}

function ecrireStockage(valeur: string, persistant: boolean) {
  try {
    (persistant ? localStorage : sessionStorage).setItem(CLE_STOCKAGE, valeur);
  } catch {
    /* navigation privée : on continue sans mémoriser */
  }
}

function effacerStockage() {
  try {
    sessionStorage.removeItem(CLE_STOCKAGE);
    localStorage.removeItem(CLE_STOCKAGE);
  } catch {
    /* ignoré */
  }
}

/** Retourne la clé en mémoire, en la restaurant depuis le stockage si besoin. */
export async function obtenirCle(): Promise<CryptoKey | null> {
  if (cleMemoire) return cleMemoire;
  const memorisee = lireStockage();
  if (!memorisee) return null;
  try {
    const cle = await importerCle(memorisee);
    if (await cleValide(cle, await params())) {
      cleMemoire = cle;
      return cle;
    }
    // Clé obsolète (contenu republi é avec un autre mot de passe) : on repart de zéro.
    effacerStockage();
  } catch {
    effacerStockage();
  }
  return null;
}

export async function estDeverrouille(): Promise<boolean> {
  return (await obtenirCle()) !== null;
}

/**
 * Tente de déverrouiller la session.
 * Retourne un message d'erreur, ou null en cas de succès.
 */
export async function deverrouiller(motDePasse: string, persistant: boolean): Promise<string | null> {
  if (!motDePasse) return 'Saisissez le mot de passe.';

  // Étape 1 — vérification de l'empreinte (retour immédiat et message clair).
  if (HASH_ATTENDU && (await sha256Hex(motDePasse)) !== HASH_ATTENDU) return 'Mot de passe incorrect.';

  // Étape 2 — dérivation de la clé et vérification sur le témoin chiffré.
  const p = await params();
  const cle = await deriverCle(motDePasse, p);
  if (!(await cleValide(cle, p))) {
    return HASH_ATTENDU
      ? 'Le mot de passe est reconnu mais ne déchiffre pas le contenu publié : le site a été construit avec un autre mot de passe.'
      : 'Mot de passe incorrect.';
  }

  cleMemoire = cle;
  ecrireStockage(await exporterCle(cle), persistant);
  abonnes.forEach((f) => f(true));
  return null;
}

/** Verrouille la session : clé oubliée, contenu déchiffré purgé de la mémoire. */
export function verrouiller() {
  cleMemoire = null;
  effacerStockage();
  viderCache();
  abonnes.forEach((f) => f(false));
}

export function surChangementVerrou(callback: (deverrouille: boolean) => void) {
  abonnes.add(callback);
  return () => abonnes.delete(callback);
}

/* ══════════════════════════════════════════════════════════════════════════
   Signal de déverrouillage — verrou à bascule, et non événement fugace
   ══════════════════════════════════════════════════════════════════════════

   L'écran de connexion annonçait l'ouverture de la session par un simple
   CustomEvent. Or les scripts de page sont des modules chargés séparément :
   quand le paquet d'une page arrivait APRÈS l'envoi de l'événement — ce qui se
   produit dès que « cle.json » est servi par le cache du navigateur, donc à
   presque chaque navigation —, la page posait son écouteur trop tard,
   n'apprenait jamais que la session était ouverte et restait indéfiniment sur
   « Déchiffrement du contenu… ». Un rechargement manuel rejouait la séquence
   avec un autre minutage et « corrigeait » le problème.

   La correction consiste à mémoriser l'état sur <html> : l'information cesse
   d'être un instant pour devenir une condition, qu'une page arrivée en retard
   peut toujours lire. « quandDeverrouille » unifie les deux cas.
   ══════════════════════════════════════════════════════════════════════════ */

/** Marque la session comme ouverte et prévient les pages déjà en écoute. */
export function signalerDeverrouillage() {
  document.documentElement.dataset.verrou = 'ouvert';
  document.dispatchEvent(new CustomEvent(EVENEMENT_DEVERROUILLE));
}

/** Marque la session comme fermée. */
export function signalerVerrouillage() {
  delete document.documentElement.dataset.verrou;
}

/** Vrai si la session est ouverte, sans attendre de vérification asynchrone. */
export function sessionOuverte(): boolean {
  return document.documentElement.dataset.verrou === 'ouvert';
}

/**
 * Exécute « callback » dès que la session est ouverte — immédiatement si elle
 * l'est déjà. C'est le seul point d'entrée que les pages doivent utiliser.
 */
export function quandDeverrouille(callback: () => void): void {
  if (sessionOuverte()) {
    queueMicrotask(callback);
    return;
  }
  document.addEventListener(EVENEMENT_DEVERROUILLE, callback, { once: true });
}
