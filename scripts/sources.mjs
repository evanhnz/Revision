#!/usr/bin/env node
/**
 * Synchronise les fiches en clair (content/) et leur copie chiffrée (sources/).
 *
 *   node scripts/sources.mjs dechiffrer   sources/ → content/
 *       Utilisé par la publication automatique (GitHub Actions), et en local
 *       après un « git pull » pour retrouver les fiches écrites depuis
 *       l'éditeur en ligne. N'efface aucun fichier local.
 *
 *   node scripts/sources.mjs chiffrer     content/ → sources/
 *       Pour publier des fiches déposées à la main dans content/ : chiffre ce
 *       qui a changé, retire de sources/ ce qui a disparu de content/, puis
 *       il reste à committer et pousser sources/.
 *
 * Le mot de passe vient de SITE_PASSWORD (variable d'environnement) ou de
 * .env.local ; le sel, de sel.json. Seuls les .md, categories.yml et
 * glossaire.yml sont concernés : ce sont les fichiers que l'éditeur gère.
 */
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';
import { deriverCle, chiffrerTexte, dechiffrerTexte } from './lib/crypto.mjs';
import { lireMotDePasseEventuel, AIDE_MOT_DE_PASSE } from './lib/motdepasse.mjs';
import { cheminAutorise } from './lib/depot-local.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossierContenu = path.join(racine, 'content');
const dossierSources = path.join(racine, 'sources');
const SUFFIXE = '.enc';

function echouer(message) {
  console.error(`\n\x1b[31m✖ ${message}\x1b[0m\n`);
  process.exit(1);
}

async function lister(dossier, base = dossier) {
  const sortie = [];
  if (!existsSync(dossier)) return sortie;
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) sortie.push(...(await lister(complet, base)));
    else sortie.push(path.relative(base, complet).split(path.sep).join('/'));
  }
  return sortie.sort();
}

async function cle() {
  const motDePasse = await lireMotDePasseEventuel();
  if (!motDePasse) echouer(AIDE_MOT_DE_PASSE);
  const cheminSel = path.join(racine, 'sel.json');
  if (!existsSync(cheminSel)) echouer('« sel.json » introuvable : lancez d\'abord « npm run contenu ».');
  const { sel } = JSON.parse(await readFile(cheminSel, 'utf8'));
  const { iterations, tailleCleBits } = config.crypto;
  return deriverCle(motDePasse, Uint8Array.from(Buffer.from(sel, 'base64')), iterations, tailleCleBits);
}

async function dechiffrer() {
  const k = await cle();
  const fichiers = (await lister(dossierSources)).filter((f) => f.endsWith(SUFFIXE));
  let ecrits = 0;
  for (const f of fichiers) {
    const relatif = f.slice(0, -SUFFIXE.length);
    if (!cheminAutorise(relatif)) continue;
    let texte;
    try {
      texte = await dechiffrerTexte(k, await readFile(path.join(dossierSources, f), 'utf8'));
    } catch {
      echouer(
        `« sources/${f} » ne se déchiffre pas.\n` +
          '  Le mot de passe (SITE_PASSWORD) n\'est pas celui avec lequel les fiches ont été enregistrées.',
      );
    }
    const cible = path.join(dossierContenu, relatif);
    await mkdir(path.dirname(cible), { recursive: true });
    await writeFile(cible, texte);
    ecrits++;
  }
  console.log(`✓ ${ecrits} fichier(s) source(s) déchiffré(s) dans content/.`);
}

async function chiffrer() {
  const k = await cle();
  const clairs = (await lister(dossierContenu)).filter(cheminAutorise);
  const voulus = new Set(clairs.map((c) => c + SUFFIXE));
  let modifies = 0;
  for (const relatif of clairs) {
    const texte = await readFile(path.join(dossierContenu, relatif), 'utf8');
    const cible = path.join(dossierSources, relatif + SUFFIXE);
    // Un IV neuf change le fichier même à contenu égal : on ne réécrit que ce
    // qui a réellement changé, pour que l'historique Git reste lisible.
    if (existsSync(cible)) {
      try {
        if ((await dechiffrerTexte(k, await readFile(cible, 'utf8'))) === texte) continue;
      } catch {
        /* illisible : on réécrit */
      }
    }
    await mkdir(path.dirname(cible), { recursive: true });
    await writeFile(cible, await chiffrerTexte(k, texte));
    modifies++;
  }
  let retires = 0;
  for (const f of await lister(dossierSources)) {
    if (!voulus.has(f)) {
      await rm(path.join(dossierSources, f));
      retires++;
    }
  }
  console.log(`✓ sources/ à jour : ${modifies} fichier(s) chiffré(s), ${retires} retiré(s).`);
  if (modifies || retires) console.log('  Il reste à committer et pousser le dossier sources/.');
}

const action = process.argv[2];
if (action === 'dechiffrer') await dechiffrer();
else if (action === 'chiffrer') await chiffrer();
else echouer('Usage : node scripts/sources.mjs dechiffrer | chiffrer');
