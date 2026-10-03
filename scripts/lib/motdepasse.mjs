/**
 * Lecture du mot de passe du site, partagée par les scripts.
 *
 * Deux sources, dans cet ordre :
 *   1. la variable d'environnement SITE_PASSWORD ;
 *   2. le fichier « .env.local » à la racine, jamais commité.
 *
 * La variable d'environnement passe en premier : c'est par elle qu'une routine
 * de veille reçoit le mot de passe, sans avoir à écrire de fichier.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function deguillemeter(valeur) {
  const v = valeur.trim();
  const guillemets = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
  return guillemets ? v.slice(1, -1) : v;
}

/**
 * Retourne le mot de passe, ou null s'il n'est disponible nulle part.
 * Les appelants décident eux-mêmes si l'absence est bloquante.
 */
export async function lireMotDePasseEventuel() {
  if (process.env.SITE_PASSWORD?.trim()) return deguillemeter(process.env.SITE_PASSWORD);

  const chemin = path.join(racine, '.env.local');
  if (!existsSync(chemin)) return null;

  const brut = await readFile(chemin, 'utf8');
  const ligne = brut.split(/\r?\n/).find((l) => /^\s*SITE_PASSWORD\s*=/.test(l));
  if (!ligne) return null;

  const motDePasse = deguillemeter(ligne.replace(/^\s*SITE_PASSWORD\s*=/, ''));
  return motDePasse || null;
}

export const AIDE_MOT_DE_PASSE =
  'Le mot de passe du site est introuvable.\n' +
  '  Définissez-le, au choix :\n' +
  '      export SITE_PASSWORD=…            (variable d\'environnement)\n' +
  '      echo "SITE_PASSWORD=…" > .env.local  (fichier local, jamais commité)';
