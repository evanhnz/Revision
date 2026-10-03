/**
 * Chiffrement du contenu au moment du build.
 *
 * Schéma : PBKDF2-HMAC-SHA256 (sel aléatoire, itérations élevées) -> clé
 * AES-GCM 256 bits. Chaque fichier publié reçoit son propre IV aléatoire.
 * Seul le résultat chiffré est écrit dans « public/data/ », donc dans « dist/ »,
 * donc sur GitHub Pages.
 */
import { webcrypto as crypto } from 'node:crypto';

const encodeur = new TextEncoder();

export function b64(octets) {
  return Buffer.from(octets).toString('base64');
}

/** Empreinte SHA-256 hexadécimale (sert à vérifier le mot de passe). */
export async function sha256Hex(texte) {
  const digest = await crypto.subtle.digest('SHA-256', encodeur.encode(texte));
  return [...new Uint8Array(digest)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

/** Dérive la clé AES-GCM à partir du mot de passe et du sel. */
export async function deriverCle(motDePasse, sel, iterations, tailleCleBits) {
  const materiel = await crypto.subtle.importKey('raw', encodeur.encode(motDePasse), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sel, iterations, hash: 'SHA-256' },
    materiel,
    { name: 'AES-GCM', length: tailleCleBits },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function selAleatoire(taille) {
  return crypto.getRandomValues(new Uint8Array(taille));
}

/** Chiffre une valeur JSON. Retourne { iv, ct } en base64. */
export async function chiffrerJson(cle, valeur, tailleIvOctets) {
  const iv = crypto.getRandomValues(new Uint8Array(tailleIvOctets));
  const donnees = encodeur.encode(JSON.stringify(valeur));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, donnees);
  return { iv: b64(iv), ct: b64(new Uint8Array(chiffre)) };
}

/**
 * Chiffre des octets bruts (fichier audio d'une fiche).
 *
 * Contrairement aux blocs JSON, le résultat n'est pas encodé en base64 : un
 * podcast pèse quelques mégaoctets, et le base64 les gonflerait d'un tiers
 * pour rien. Le fichier publié est donc binaire, l'IV en tête.
 */
export async function chiffrerBinaire(cle, octets, tailleIvOctets) {
  const iv = crypto.getRandomValues(new Uint8Array(tailleIvOctets));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, octets);
  return Buffer.concat([Buffer.from(iv), Buffer.from(chiffre)]);
}

/** Identifiant stable et opaque : ne révèle rien du contenu, ne change pas d'un build à l'autre. */
export async function idStable(texte, longueur = 16) {
  const digest = await crypto.subtle.digest('SHA-256', encodeur.encode(texte));
  return [...new Uint8Array(digest)]
    .map((o) => o.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, longueur);
}

// --- Fichiers sources chiffrés (dossier « sources/ » du dépôt) -------------
//
// Les fiches en clair ne quittent jamais la machine ou le navigateur : dans le
// dépôt GitHub, chacune est un petit JSON { v, iv, ct }, le texte UTF-8 étant
// chiffré en AES-GCM avec la clé du site. Le navigateur (éditeur) et la
// publication automatique (GitHub Actions) utilisent le même format.

const decodeur = new TextDecoder();

export async function chiffrerTexte(cle, texte, tailleIvOctets = 12) {
  const iv = crypto.getRandomValues(new Uint8Array(tailleIvOctets));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, encodeur.encode(texte));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(new Uint8Array(chiffre)) }) + '\n';
}

export async function dechiffrerTexte(cle, enveloppe) {
  const { iv, ct } = typeof enveloppe === 'string' ? JSON.parse(enveloppe) : enveloppe;
  const clair = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
    cle,
    Buffer.from(ct, 'base64'),
  );
  return decodeur.decode(clair);
}
