#!/usr/bin/env node
/**
 * Installe la chaîne de synthèse vocale des fiches audio.
 *
 * Tout est local et gratuit — rien de ce qui est installé ici n'envoie quoi
 * que ce soit sur le réseau une fois en place :
 *
 *  - le moteur choisi dans « site.config.mjs » : « kokoro » (paquet Python
 *    sherpa-onnx) ou « piper » (paquet Python piper-tts) ;
 *  - « imageio-ffmpeg » : un ffmpeg statique, pour l'encodage MP3, si la
 *    machine n'en a pas déjà un ;
 *  - le modèle de voix : ≈ 390 Mo pour Kokoro, ≈ 65 Mo pour Piper.
 *
 * Les modèles sont déposés dans « outils/ », qui n'est pas commité : ils se
 * réinstallent en une commande et n'ont pas à peser sur le dépôt.
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, rename, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';
import { cheminModele, MOTEURS } from './lib/voix.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moteur = MOTEURS[config.podcast.moteur];

const couleur = {
  rouge: (t) => `\x1b[31m${t}\x1b[0m`,
  vert: (t) => `\x1b[32m${t}\x1b[0m`,
  gris: (t) => `\x1b[90m${t}\x1b[0m`,
};

function executer(commande, args, options = {}) {
  return new Promise((resoudre, rejeter) => {
    const p = spawn(commande, args, { stdio: 'inherit', ...options });
    p.on('error', rejeter);
    p.on('close', (code) =>
      code === 0 ? resoudre() : rejeter(new Error(`${commande} a terminé avec le code ${code}`)),
    );
  });
}

/** Télécharge une archive et l'ouvre dans un dossier temporaire. */
async function telecharger(url, destination) {
  const reponse = await fetch(url);
  if (!reponse.ok) {
    throw new Error(
      `Modèle introuvable (${reponse.status}) :\n  ${url}\n` +
        '  Vérifiez la section « podcast » de site.config.mjs.',
    );
  }
  const archive = path.join(destination, 'archive.tar.bz2');
  await writeFile(archive, Buffer.from(await reponse.arrayBuffer()));
  await executer('tar', ['xjf', archive, '-C', destination]);
  await rm(archive, { force: true });
}

async function main() {
  const modele = cheminModele(racine, config.podcast);
  const dossier = path.dirname(modele);
  await mkdir(dossier, { recursive: true });

  console.log(couleur.gris(`› Installation du moteur « ${config.podcast.moteur} » et de ffmpeg…`));
  await executer('pip', ['install', '--quiet', '--upgrade', moteur.paquet, 'imageio-ffmpeg']);

  if (existsSync(modele)) {
    console.log(couleur.vert('✓') + ` Voix déjà installée (${path.relative(racine, modele)}).`);
    return;
  }

  console.log(couleur.gris(`› Téléchargement du modèle (${moteur.poids})…`));
  const extraction = path.join(dossier, 'extraction');
  await rm(extraction, { recursive: true, force: true });
  await mkdir(extraction, { recursive: true });
  await telecharger(moteur.url(config.podcast), extraction);

  // L'archive contient un dossier ; on remonte son contenu d'un cran pour que
  // le chemin du modèle ne dépende pas du nom donné par l'archive.
  const racineArchive = (await readdir(extraction, { withFileTypes: true })).find((e) =>
    e.isDirectory(),
  );
  const source = racineArchive ? path.join(extraction, racineArchive.name) : extraction;
  let deplaces = 0;
  for (const entree of await readdir(source)) {
    if (moteur.garder && !moteur.garder(entree)) continue;
    await rename(path.join(source, entree), path.join(dossier, entree));
    deplaces++;
  }
  await rm(extraction, { recursive: true, force: true });

  if (!deplaces || !existsSync(modele)) {
    throw new Error('Archive inattendue : le modèle attendu n\'y figure pas.');
  }
  console.log(couleur.vert('✓') + ` Voix installée dans ${path.relative(racine, dossier)}/.`);
  console.log(couleur.gris('  Lancez « npm run podcasts » pour produire les fiches audio.'));
}

main().catch((e) => {
  console.error(couleur.rouge('\n✖ Installation impossible :'), e.message ?? e);
  process.exit(1);
});
