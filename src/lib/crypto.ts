/**
 * Déchiffrement côté navigateur (API Web Crypto native, aucune dépendance).
 *
 * Le contenu publié sur GitHub Pages est chiffré en AES-GCM. La clé est
 * redérivée ici, en mémoire, à partir du mot de passe saisi et du sel public
 * publié dans « data/cle.json ».
 */

export interface ParametresCle {
  v: number;
  kdf: string;
  iterations: number;
  sel: string;
  chiffrement: string;
  temoin: Blob;
}

export interface Blob {
  iv: string;
  ct: string;
}

const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

function base64VersOctets(b64: string): Uint8Array {
  const binaire = atob(b64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

function octetsVersBase64(octets: Uint8Array): string {
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire);
}

/** Empreinte SHA-256 hexadécimale, utilisée par l'écran de connexion. */
export async function sha256Hex(texte: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encodeur.encode(texte));
  return [...new Uint8Array(digest)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

/** Dérive la clé AES-GCM (PBKDF2). Extractible pour pouvoir la mémoriser. */
export async function deriverCle(motDePasse: string, params: ParametresCle): Promise<CryptoKey> {
  const materiel = await crypto.subtle.importKey('raw', encodeur.encode(motDePasse), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64VersOctets(params.sel) as BufferSource,
      iterations: params.iterations,
      hash: 'SHA-256',
    },
    materiel,
    { name: 'AES-GCM', length: 256 },
    true,
    // « encrypt » : l'éditeur chiffre les fiches qu'il enregistre dans le dépôt.
    ['encrypt', 'decrypt'],
  );
}

/** Déchiffre un blob { iv, ct } et parse le JSON obtenu. */
export async function dechiffrerJson<T>(cle: CryptoKey, blob: Blob): Promise<T> {
  const clair = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64VersOctets(blob.iv) as BufferSource },
    cle,
    base64VersOctets(blob.ct) as BufferSource,
  );
  return JSON.parse(decodeur.decode(clair)) as T;
}

/**
 * Déchiffre un fichier binaire (fiche audio), dont l'IV occupe les premiers
 * octets. Les podcasts pèsent quelques mégaoctets : ils ne passent pas par le
 * base64, qui les alourdirait d'un tiers.
 */
export async function dechiffrerBinaire(
  cle: CryptoKey,
  octets: ArrayBuffer,
  tailleIvOctets = 12,
): Promise<ArrayBuffer> {
  const iv = new Uint8Array(octets, 0, tailleIvOctets);
  const chiffre = new Uint8Array(octets, tailleIvOctets);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cle, chiffre as BufferSource);
}

/** Vérifie que la clé dérivée déchiffre bien le témoin publié. */
export async function cleValide(cle: CryptoKey, params: ParametresCle): Promise<boolean> {
  try {
    const temoin = await dechiffrerJson<{ ok: boolean }>(cle, params.temoin);
    return temoin?.ok === true;
  } catch {
    return false;
  }
}

/** Sérialise la clé pour la mémoriser entre deux visites. */
export async function exporterCle(cle: CryptoKey): Promise<string> {
  const brut = await crypto.subtle.exportKey('raw', cle);
  return octetsVersBase64(new Uint8Array(brut));
}

export async function importerCle(brutBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64VersOctets(brutBase64) as BufferSource,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// --- Fichiers sources chiffrés ------------------------------------------------
// Même format que « scripts/lib/crypto.mjs » : { v, iv, ct }, texte UTF-8.

export async function chiffrerTexte(cle: CryptoKey, texte: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cle, encodeur.encode(texte));
  return JSON.stringify({ v: 1, iv: octetsVersBase64(iv), ct: octetsVersBase64(new Uint8Array(chiffre)) }) + '\n';
}

export async function dechiffrerTexte(cle: CryptoKey, enveloppe: string): Promise<string> {
  const { iv, ct } = JSON.parse(enveloppe) as Blob;
  const clair = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64VersOctets(iv) as BufferSource },
    cle,
    base64VersOctets(ct) as BufferSource,
  );
  return decodeur.decode(clair);
}

/** Empreinte tronquée, identique à « idStable » du build : nomme les fichiers publiés. */
export async function idStable(texte: string, longueur = 16): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encodeur.encode(texte));
  return [...new Uint8Array(digest)]
    .map((o) => o.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, longueur);
}
