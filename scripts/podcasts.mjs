#!/usr/bin/env node
/**
 * Fiches audio : réécriture en script parlé, puis synthèse vocale locale.
 *
 * Deux étapes, indépendantes l'une de l'autre :
 *
 *  1. le script (« <fiche>.podcast.md », à côté de la fiche, dans « content/ »
 *     donc jamais commité) est toujours régénéré quand le cours a changé. La
 *     réécriture est déterministe et instantanée : elle tourne dans le flux de
 *     contenu habituel, à chaque « npm run contenu » ;
 *
 *  2. la voix n'est synthétisée que si l'outillage est installé
 *     (« npm run podcasts:installer ») et seulement pour les fiches dont le
 *     script a changé — synthétiser vingt heures de parole à chaque build
 *     n'aurait aucun sens.
 *
 * L'audio produit reste en clair dans « content/.audio/ » : c'est
 * « scripts/build-content.mjs » qui le chiffre vers « public/data/audio/ ».
 */
import { readFile, readdir, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyserFiche } from './lib/fiche.mjs';
import YAML from 'yaml';
import config from '../site.config.mjs';
import { decouperSections } from './lib/markdown.mjs';
import { ecrireScript, VERSION_SCRIPT } from './lib/podcast.mjs';
import { idStable, sha256Hex } from './lib/crypto.mjs';
import { cheminModele, formatAudio, MOTEURS } from './lib/voix.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossierContenu = path.join(racine, 'content');
export const dossierAudio = path.join(dossierContenu, '.audio');

const couleur = {
  rouge: (t) => `\x1b[31m${t}\x1b[0m`,
  vert: (t) => `\x1b[32m${t}\x1b[0m`,
  jaune: (t) => `\x1b[33m${t}\x1b[0m`,
  gris: (t) => `\x1b[90m${t}\x1b[0m`,
};

/**
 * Témoin de synthèse en cours.
 *
 * Une synthèse dure des heures. Un « npm run dev » lancé pendant ce temps
 * relancerait un second jeu de processus sur les mêmes fiches, qui se
 * disputeraient les cœurs et s'écraseraient mutuellement. Le témoin porte le
 * numéro du processus en cours : s'il vit encore, on le laisse travailler.
 */
const cheminVerrou = () => path.join(dossierAudio, '.synthese-en-cours');

async function synthesePosee() {
  if (!existsSync(cheminVerrou())) return false;
  const pid = Number((await readFile(cheminVerrou(), 'utf8')).trim());
  try {
    process.kill(pid, 0); // ne tue rien : vérifie seulement que le processus existe
    return pid;
  } catch {
    return false; // témoin laissé par une exécution interrompue
  }
}

/** Suffixe des scripts parlés. Ils ne sont pas des fiches : le build les ignore. */
export const SUFFIXE_SCRIPT = '.podcast.md';

/** Parcourt « content/ » et retourne les fiches (jamais les scripts parlés). */
async function listerFiches(dossier, base = dossier) {
  const fichiers = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    if (entree.name.startsWith('.')) continue;
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) fichiers.push(...(await listerFiches(complet, base)));
    else if (entree.isFile() && entree.name.endsWith('.md') && !entree.name.endsWith(SUFFIXE_SCRIPT)) {
      fichiers.push(path.relative(base, complet));
    }
  }
  return fichiers.sort();
}

async function chargerGlossaire() {
  for (const nom of ['glossaire.yml', 'glossaire.yaml']) {
    const chemin = path.join(dossierContenu, nom);
    if (existsSync(chemin)) return YAML.parse(await readFile(chemin, 'utf8')) ?? [];
  }
  return [];
}

const moteur = MOTEURS[config.podcast.moteur];
if (!moteur) throw new Error(`Moteur de synthèse inconnu : « ${config.podcast.moteur} ».`);
const format = formatAudio(config.podcast);

/** Fichier audio d'une fiche, dans le format actuellement configuré. */
const cheminAudio = (ficheId) => path.join(dossierAudio, `${ficheId}.${format.extension}`);

/** Chemin du modèle de voix installé localement. */
const cheminVoix = () => cheminModele(racine, config.podcast);

/** Vérifie que la chaîne de synthèse est installée. Retourne null si oui. */
async function outillageManquant() {
  if (!existsSync(cheminVoix())) {
    return `modèle de voix absent de ${path.relative(racine, path.dirname(cheminVoix()))}/`;
  }
  const ok = await new Promise((resoudre) => {
    const p = spawn('python3', ['-c', `import ${moteur.module}`], { stdio: 'ignore' });
    p.on('error', () => resoudre(false));
    p.on('close', (code) => resoudre(code === 0));
  });
  return ok ? null : `module Python « ${moteur.paquet} » non installé`;
}

/** Localise ffmpeg : sur le PATH, sinon celui fourni par imageio-ffmpeg. */
async function trouverFfmpeg() {
  const surLeChemin = await new Promise((resoudre) => {
    const p = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    p.on('error', () => resoudre(false));
    p.on('close', (code) => resoudre(code === 0));
  });
  if (surLeChemin) return 'ffmpeg';
  const sortie = await new Promise((resoudre) => {
    let texte = '';
    const p = spawn('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']);
    p.stdout.on('data', (d) => (texte += d));
    p.on('error', () => resoudre(''));
    p.on('close', () => resoudre(texte.trim()));
  });
  return sortie && existsSync(sortie) ? sortie : null;
}

/** Métadonnées d'un audio déjà synthétisé (ou null). */
async function lireMeta(id) {
  const chemin = path.join(dossierAudio, `${id}.json`);
  if (!existsSync(chemin)) return null;
  try {
    return JSON.parse(await readFile(chemin, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Audio disponible pour une fiche, avec sa durée et son poids.
 * Utilisé par le build pour savoir quoi chiffrer.
 */
export async function audioDisponible(ficheId) {
  const chemin = cheminAudio(ficheId);
  if (!existsSync(chemin)) return null;
  const meta = await lireMeta(ficheId);
  return {
    chemin,
    type: format.type,
    octets: (await stat(chemin)).size,
    secondes: meta?.secondes ?? null,
    empreinte: meta?.empreinte ?? null,
  };
}

async function main() {
  const t0 = Date.now();
  if (!existsSync(dossierContenu)) return;

  const glossaire = await chargerGlossaire();
  const fichiers = await listerFiches(dossierContenu);
  await mkdir(dossierAudio, { recursive: true });

  const taches = [];
  let inchanges = 0;
  let sansCours = 0;

  for (const relatif of fichiers) {
    const complet = path.join(dossierContenu, relatif);
    const analyse = analyserFiche(await readFile(complet, 'utf8'));
    if (!analyse.meta) continue;

    const sections = analyse.brut;
    const script = ecrireScript({
      titre: analyse.meta.titre,
      matiere: analyse.meta.chemin[0],
      fascicule: analyse.meta.chemin.slice(1).join(', '),
      cours: sections.cours,
      glossaire,
    });
    const ficheId = await idStable(relatif);
    const cheminScript = complet.replace(/\.md$/, SUFFIXE_SCRIPT);

    if (!script) {
      // Fiche sans cours : ni script ni audio, et on efface ce qui traîne.
      sansCours++;
      await rm(cheminScript, { force: true });
      await rm(cheminAudio(ficheId), { force: true });
      await rm(path.join(dossierAudio, `${ficheId}.json`), { force: true });
      continue;
    }

    // L'empreinte couvre le texte dit ET la version du réécriveur : modifier
    // le cours, ou la façon de le mettre en voix, régénère l'audio.
    const empreinte = await sha256Hex(
      [
        VERSION_SCRIPT,
        config.podcast.moteur,
        JSON.stringify(config.podcast[config.podcast.moteur]),
        config.podcast.vitesse,
        config.podcast.format,
        config.podcast.bitrate,
        script.paragraphes.join('\n'),
      ].join('|'),
    );

    const entete = [
      '---',
      `fiche: ${JSON.stringify(relatif)}`,
      `titre: ${JSON.stringify(analyse.meta.titre)}`,
      `mots: ${script.mots}`,
      `duree_estimee_min: ${Math.round(script.secondesEstimees / 60)}`,
      `empreinte: ${empreinte}`,
      '---',
      '',
      '<!-- Script parlé engendré par « npm run podcasts ». Ne pas modifier à la main :',
      '     toute correction doit se faire dans la fiche, ou dans scripts/lib/podcast.mjs. -->',
      '',
    ].join('\n');
    await writeFile(cheminScript, entete + script.paragraphes.join('\n\n') + '\n');

    const meta = await lireMeta(ficheId);
    const dejaFait = meta?.empreinte === empreinte && existsSync(cheminAudio(ficheId));
    if (dejaFait) {
      inchanges++;
      continue;
    }
    taches.push({
      id: ficheId,
      titre: analyse.meta.titre,
      script: cheminScript,
      sortie: cheminAudio(ficheId),
      empreinte,
      minutes: Math.round(script.secondesEstimees / 60),
    });
  }

  console.log(
    couleur.gris(
      `› Podcasts : ${fichiers.length - sansCours} script(s) à jour` +
        (inchanges ? `, dont ${inchanges} audio déjà synthétisé(s)` : ''),
    ),
  );
  if (!taches.length) return;

  const enCours = await synthesePosee();
  if (enCours) {
    console.log(
      couleur.jaune(
        `  ! une synthèse tourne déjà (processus ${enCours}) : ${taches.length} fiche(s) lui restent à produire.`,
      ),
    );
    return;
  }

  // Pendant le développement, on peut vouloir les scripts sans attendre la
  // voix : « REVINSP_SANS_PODCAST=1 npm run dev ».
  if (process.env.REVINSP_SANS_PODCAST) {
    console.log(couleur.jaune(`  ! synthèse ignorée (REVINSP_SANS_PODCAST) : ${taches.length} fiche(s) en attente.`));
    return;
  }

  const manque = await outillageManquant();
  if (manque) {
    console.log(
      couleur.jaune(
        `  ! ${taches.length} fiche(s) sans audio : ${manque}.\n` +
          '    Installez la chaîne de synthèse avec « npm run podcasts:installer ».',
      ),
    );
    return;
  }

  const ffmpeg = await trouverFfmpeg();
  if (!ffmpeg) {
    console.log(couleur.jaune('  ! ffmpeg introuvable : « npm run podcasts:installer » l\'installe.'));
    return;
  }

  await synthetiser(taches, ffmpeg, t0);
}

/** Lance les processus de synthèse et suit leur avancement. */
async function synthetiser(taches, ffmpeg, t0) {
  const minutes = taches.reduce((n, t) => n + t.minutes, 0);
  console.log(
    couleur.gris(`› Synthèse de ${taches.length} fiche(s), environ ${minutes} minutes de parole…`),
  );

  const fichierTaches = path.join(dossierAudio, 'taches.json');
  await writeFile(fichierTaches, JSON.stringify(taches));
  await writeFile(cheminVerrou(), String(process.pid));
  const leverVerrou = () => {
    try {
      if (existsSync(cheminVerrou())) rmSync(cheminVerrou());
    } catch {
      /* rien à faire de plus */
    }
  };
  process.once('exit', leverVerrou);
  process.once('SIGINT', () => {
    leverVerrou();
    process.exit(130);
  });

  // Un processus par cœur, chacun mono-thread : c'est le partage le plus
  // efficace pour une charge entièrement processeur.
  const parts = Math.max(1, Math.min(availableParallelism?.() ?? 4, taches.length));
  const titres = new Map(taches.map((t) => [t.id, t.titre]));
  let faits = 0;
  const echecs = [];

  await Promise.all(
    Array.from({ length: parts }, (_, part) =>
      new Promise((resoudre, rejeter) => {
        const processus = spawn(
          'python3',
          [
            path.join(racine, 'scripts', 'synthese-voix.py'),
            '--moteur', config.podcast.moteur,
            '--modele', cheminVoix(),
            '--voix', config.podcast.kokoro.voix,
            '--taches', fichierTaches,
            '--part', String(part),
            '--parts', String(parts),
            '--vitesse', String(config.podcast.vitesse),
            '--silence-paragraphe', String(config.podcast.silenceParagrapheMs),
            '--silence-phrase', String(config.podcast.silencePhraseMs),
            '--bitrate', config.podcast.bitrate,
            '--format', config.podcast.format,
            '--ffmpeg', ffmpeg,
          ],
          { env: { ...process.env, OMP_NUM_THREADS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
        );

        let reste = '';
        processus.stdout.on('data', async (bloc) => {
          reste += bloc;
          const lignes = reste.split('\n');
          reste = lignes.pop() ?? '';
          for (const ligne of lignes) {
            if (!ligne.trim()) continue;
            let resultat;
            try {
              resultat = JSON.parse(ligne);
            } catch {
              continue;
            }
            if (resultat.erreur) {
              echecs.push(`${titres.get(resultat.id) ?? resultat.id} : ${resultat.erreur}`);
              continue;
            }
            faits++;
            const tache = taches.find((t) => t.id === resultat.id);
            await writeFile(
              path.join(dossierAudio, `${resultat.id}.json`),
              JSON.stringify({
                empreinte: tache?.empreinte,
                secondes: resultat.secondes,
                octets: resultat.octets,
                moteur: config.podcast.moteur,
                genereLe: new Date().toISOString(),
              }),
            );
            process.stdout.write(
              couleur.gris(
                `  ${String(faits).padStart(3)}/${taches.length} · ${Math.round(resultat.secondes / 60)} min · ` +
                  `${(resultat.octets / 1024 / 1024).toFixed(1)} Mo · ${titres.get(resultat.id) ?? ''}\n`,
              ),
            );
          }
        });
        // La sortie d'erreur est filtrée ligne par ligne, et non bloc par
        // bloc : les phonémiseurs écrivent des messages longs, qu'un bloc
        // peut couper en deux — le filtre ne les reconnaîtrait plus.
        let resteErreur = '';
        processus.stderr.on('data', (bloc) => {
          resteErreur += bloc;
          const lignes = resteErreur.split('\n');
          resteErreur = lignes.pop() ?? '';
          for (const ligne of lignes) {
            // Bruit de fond : espeak signale les caractères qu'il ignore
            // (tirets, ponctuation) à chaque phrase.
            if (/Missing phoneme|Skip unknown|phonemize|warn/i.test(ligne)) continue;
            if (ligne.trim()) process.stderr.write(couleur.gris(ligne + '\n'));
          }
        });
        processus.on('error', rejeter);
        processus.on('close', () => resoudre());
      }),
    ),
  );

  await rm(fichierTaches, { force: true });
  leverVerrou();
  for (const echec of echecs) console.log(couleur.rouge(`  ✖ ${echec}`));
  console.log(
    couleur.vert('✓') +
      ` ${faits} fiche(s) audio synthétisée(s)` +
      couleur.gris(` en ${Math.round((Date.now() - t0) / 1000)} s`),
  );
}

// Exécuté directement (« npm run podcasts ») ; importé ailleurs pour
// « audioDisponible », sans rien déclencher.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(couleur.rouge('\n✖ Échec de la génération des podcasts :'), e);
    process.exit(1);
  });
}
