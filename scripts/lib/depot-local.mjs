/**
 * Dépôt local de l'éditeur : un greffon Vite actif seulement en développement
 * (« npm run dev »). Il expose les fichiers sources de « content/ » à l'éditeur
 * du navigateur, et relance le chiffrement du contenu après chaque écriture,
 * pour que le site affiche aussitôt la fiche enregistrée.
 *
 * En ligne, l'éditeur passe par le dépôt GitHub : ce greffon n'existe pas dans
 * le site publié (« apply: 'serve' »).
 *
 *   GET    /__depot/liste                → [{ chemin, contenu }]
 *   PUT    /__depot/fichier?chemin=…     → écrit le corps de la requête
 *   DELETE /__depot/fichier?chemin=…     → supprime
 *   GET    /__depot/etat                 → { reconstruction: 'prete' | 'en-cours' | 'erreur', message }
 */
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

/** Seuls ces fichiers sont lisibles et modifiables par l'éditeur. */
export function cheminAutorise(relatif) {
  if (typeof relatif !== 'string' || !relatif) return false;
  const normalise = path.posix.normalize(relatif.replace(/\\/g, '/'));
  if (normalise.startsWith('..') || normalise.startsWith('/') || normalise.includes('/../')) return false;
  if (normalise.split('/').some((s) => s.startsWith('.'))) return false;
  if (normalise.endsWith('.podcast.md')) return false;
  return normalise.endsWith('.md') || normalise === 'categories.yml' || normalise === 'glossaire.yml';
}

async function lister(dossier, base = dossier) {
  const sortie = [];
  if (!existsSync(dossier)) return sortie;
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) sortie.push(...(await lister(complet, base)));
    else {
      const relatif = path.relative(base, complet).split(path.sep).join('/');
      if (cheminAutorise(relatif)) sortie.push(relatif);
    }
  }
  return sortie.sort();
}

function lireCorps(req) {
  return new Promise((resoudre, rejeter) => {
    const morceaux = [];
    let taille = 0;
    req.on('data', (m) => {
      taille += m.length;
      if (taille > 5 * 1024 * 1024) rejeter(new Error('fichier trop volumineux (5 Mo au plus)'));
      morceaux.push(m);
    });
    req.on('end', () => resoudre(Buffer.concat(morceaux).toString('utf8')));
    req.on('error', rejeter);
  });
}

export function depotLocal({ racine }) {
  const dossierContenu = path.join(racine, 'content');
  const etat = { reconstruction: 'prete', message: '' };
  let minuterie = null;
  let enCours = null;
  let relancer = false;

  /** Rechiffre le contenu, en regroupant les écritures rapprochées. */
  function planifierReconstruction() {
    etat.reconstruction = 'en-cours';
    clearTimeout(minuterie);
    minuterie = setTimeout(lancer, 300);
  }

  function lancer() {
    if (enCours) {
      relancer = true;
      return;
    }
    enCours = new Promise((resoudre) => {
      const enfant = spawn(process.execPath, [path.join(racine, 'scripts', 'build-content.mjs')], {
        cwd: racine,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      let sortie = '';
      enfant.stdout.on('data', (d) => (sortie += d));
      enfant.stderr.on('data', (d) => (sortie += d));
      enfant.on('close', (code) => {
        etat.reconstruction = code === 0 ? 'prete' : 'erreur';
        etat.message = sortie.trim().slice(-4000);
        enCours = null;
        resoudre();
        if (relancer) {
          relancer = false;
          planifierReconstruction();
        }
      });
    });
  }

  const json = (res, code, valeur) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(valeur));
  };

  return {
    name: 'depot-local-editeur',
    apply: 'serve',
    configureServer(serveur) {
      serveur.middlewares.use(async (req, res, suivant) => {
        if (!req.url?.includes('/__depot/')) return suivant();
        const url = new URL(req.url, 'http://local');
        const route = url.pathname.slice(url.pathname.indexOf('/__depot/') + '/__depot/'.length);
        try {
          if (route === 'liste' && req.method === 'GET') {
            const fichiers = await lister(dossierContenu);
            const sortie = [];
            for (const chemin of fichiers) {
              sortie.push({ chemin, contenu: await readFile(path.join(dossierContenu, chemin), 'utf8') });
            }
            return json(res, 200, sortie);
          }
          if (route === 'etat' && req.method === 'GET') return json(res, 200, etat);
          if (route === 'fichier') {
            const relatif = url.searchParams.get('chemin');
            if (!cheminAutorise(relatif)) return json(res, 400, { erreur: `chemin refusé : ${relatif}` });
            const complet = path.join(dossierContenu, relatif);
            if (req.method === 'PUT') {
              const contenu = await lireCorps(req);
              await mkdir(path.dirname(complet), { recursive: true });
              await writeFile(complet, contenu);
              planifierReconstruction();
              return json(res, 200, { ok: true });
            }
            if (req.method === 'DELETE') {
              await rm(complet, { force: true });
              planifierReconstruction();
              return json(res, 200, { ok: true });
            }
          }
          return json(res, 404, { erreur: 'route inconnue' });
        } catch (e) {
          return json(res, 500, { erreur: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
