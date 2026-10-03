#!/usr/bin/env node
/**
 * Étape 1 du déploiement : lit « content/ » (en clair, jamais commité),
 * valide, transforme en HTML, puis écrit UNIQUEMENT du contenu chiffré
 * dans « public/data/ ».
 *
 * Lancé automatiquement par « npm run dev » et « npm run deploy ».
 */
import { readFile, readdir, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import config from '../site.config.mjs';
import { glossaireSchema, categoriesSchema } from './lib/schema.mjs';
import { analyserFiche } from './lib/fiche.mjs';
import { lireMotDePasseEventuel, AIDE_MOT_DE_PASSE } from './lib/motdepasse.mjs';
import { construireIndexGlossaire, idTerme } from './lib/glossaire.mjs';
import { rendreHtml, texteBrut, extraireSommaire } from './lib/markdown.mjs';
import { sha256Hex, deriverCle, selAleatoire, chiffrerJson, chiffrerBinaire, idStable, b64 } from './lib/crypto.mjs';
import { audioDisponible, SUFFIXE_SCRIPT } from './podcasts.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossierContenu = path.join(racine, 'content');
const dossierSortie = path.join(racine, 'public', 'data');

const couleur = {
  rouge: (t) => `\x1b[31m${t}\x1b[0m`,
  vert: (t) => `\x1b[32m${t}\x1b[0m`,
  jaune: (t) => `\x1b[33m${t}\x1b[0m`,
  gris: (t) => `\x1b[90m${t}\x1b[0m`,
};

const avertissements = [];
const erreurs = [];

function echouer(message) {
  console.error(`\n${couleur.rouge('✖ ' + message)}\n`);
  process.exit(1);
}

/** Lit le mot de passe (SITE_PASSWORD ou .env.local) et vérifie son empreinte. */
async function lireMotDePasse() {
  const motDePasse = await lireMotDePasseEventuel();
  if (!motDePasse) echouer(AIDE_MOT_DE_PASSE);
  const attendue = (process.env.PUBLIC_MOT_DE_PASSE_HASH || config.motDePasseHash || '').toLowerCase();
  if (attendue && (await sha256Hex(motDePasse)) !== attendue) {
    echouer(
      'Le mot de passe ne correspond pas à l\'empreinte attendue\n' +
        '  (site.config.mjs ou PUBLIC_MOT_DE_PASSE_HASH).',
    );
  }
  return motDePasse;
}

/**
 * Parcourt récursivement content/ et retourne la liste des fiches (.md).
 * Les scripts parlés (« .podcast.md ») et les dossiers techniques (« .audio »)
 * en sont exclus : ce ne sont pas des fiches.
 */
async function listerFiches(dossier, base = dossier) {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const fichiers = [];
  for (const entree of entrees) {
    if (entree.name.startsWith('.')) continue;
    const complet = path.join(dossier, entree.name);
    if (entree.isDirectory()) {
      fichiers.push(...(await listerFiches(complet, base)));
    } else if (entree.isFile() && entree.name.endsWith('.md') && !entree.name.endsWith(SUFFIXE_SCRIPT)) {
      fichiers.push(path.relative(base, complet));
    }
  }
  return fichiers.sort();
}

/** Charge content/glossaire.yml (optionnel). */
async function chargerGlossaire() {
  for (const nom of ['glossaire.yml', 'glossaire.yaml']) {
    const chemin = path.join(dossierContenu, nom);
    if (!existsSync(chemin)) continue;
    const brut = await readFile(chemin, 'utf8');
    let donnees;
    try {
      donnees = YAML.parse(brut) ?? [];
    } catch (e) {
      echouer(`« content/${nom} » est un YAML invalide : ${e.message}`);
    }
    const resultat = glossaireSchema.safeParse(donnees);
    if (!resultat.success) {
      echouer(
        `« content/${nom} » ne respecte pas le format attendu :\n` +
          resultat.error.issues.map((i) => `  - ${i.path.join('.')} : ${i.message}`).join('\n'),
      );
    }
    return resultat.data;
  }
  avertissements.push('Aucun « content/glossaire.yml » : les définitions ne seront pas affichées.');
  return [];
}

/** Lit le sel de « sel.json », ou le crée au premier build. */
async function lireOuCreerSel(taille) {
  const chemin = path.join(racine, 'sel.json');
  if (existsSync(chemin)) {
    const { sel } = JSON.parse(await readFile(chemin, 'utf8'));
    return Uint8Array.from(Buffer.from(sel, 'base64'));
  }
  const sel = selAleatoire(taille);
  await writeFile(chemin, JSON.stringify({ sel: b64(sel) }, null, 2) + '\n');
  avertissements.push('Sel de chiffrement créé dans « sel.json » : commitez ce fichier.');
  return sel;
}

/** Charge content/categories.yml (optionnel) : ordre et catégories vides. */
async function chargerCategories() {
  for (const nom of ['categories.yml', 'categories.yaml']) {
    const chemin = path.join(dossierContenu, nom);
    if (!existsSync(chemin)) continue;
    let donnees;
    try {
      donnees = YAML.parse(await readFile(chemin, 'utf8')) ?? [];
    } catch (e) {
      echouer(`« content/${nom} » est un YAML invalide : ${e.message}`);
    }
    const resultat = categoriesSchema.safeParse(donnees);
    if (!resultat.success) {
      echouer(
        `« content/${nom} » ne respecte pas le format attendu :\n` +
          resultat.error.issues.map((i) => `  - ${i.path.join('.')} : ${i.message}`).join('\n'),
      );
    }
    return resultat.data;
  }
  return [];
}

/**
 * Arborescence complète : celle de categories.yml, complétée par les chemins
 * des fiches. Une catégorie absente du fichier est ajoutée à la fin de son
 * niveau, une catégorie sans fiche est conservée (c'est ce qui permet de
 * préparer un plan avant de le remplir).
 */
async function construireArbre(categories, fiches) {
  const creer = (nom, chemin, icone) => ({ nom, chemin, icone, enfants: [], fiches: [] });
  const racineArbre = creer('', [], undefined);

  const trouverOuCreer = (parent, nom, icone) => {
    const cle = nom.toLowerCase();
    let noeud = parent.enfants.find((e) => e.nom.toLowerCase() === cle);
    if (!noeud) {
      noeud = creer(nom, [...parent.chemin, nom], icone);
      parent.enfants.push(noeud);
    } else if (icone && !noeud.icone) noeud.icone = icone;
    return noeud;
  };

  const semer = (parent, liste) => {
    for (const c of liste) semer(trouverOuCreer(parent, c.nom, c.icone), c.enfants);
  };
  semer(racineArbre, categories);

  for (const f of fiches) {
    let noeud = racineArbre;
    for (const segment of f.chemin) noeud = trouverOuCreer(noeud, segment);
    f.chemin = noeud.chemin; // casse canonique, celle de la première occurrence
    noeud.fiches.push(f);
  }

  const finaliser = async (noeud) => {
    noeud.fiches.sort((a, b) => a.ordre - b.ordre || a.titre.localeCompare(b.titre, 'fr', { numeric: true }));
    const sortie = {
      id: await idStable(`cat|${noeud.chemin.join('|')}`, 12),
      nom: noeud.nom,
      chemin: noeud.chemin,
      ...(noeud.icone ? { icone: noeud.icone } : {}),
      fiches: noeud.fiches.map((f) => f.id),
      enfants: [],
    };
    for (const e of noeud.enfants) sortie.enfants.push(await finaliser(e));
    return sortie;
  };
  const resultat = [];
  for (const e of racineArbre.enfants) resultat.push(await finaliser(e));
  return resultat;
}

/** Libellé du « fascicule » : le chemin sous la matière. */
const LIBELLE_RACINE = 'Généralités';
const libelleFascicule = (chemin) => chemin.slice(1).join(' › ') || LIBELLE_RACINE;

async function main() {
  const t0 = Date.now();
  console.log(couleur.gris('› Chiffrement du contenu…'));

  const motDePasse = await lireMotDePasse();

  if (!existsSync(dossierContenu)) {
    await mkdir(dossierContenu, { recursive: true });
    avertissements.push('Dossier « content/ » créé, vide : ajoutez des fiches depuis l\'éditeur.');
  }

  const glossaire = await chargerGlossaire();
  const categories = await chargerCategories();
  const indexGlossaire = construireIndexGlossaire(glossaire, config.glossaire);

  const fichiers = await listerFiches(dossierContenu);
  if (fichiers.length === 0) avertissements.push('Aucune fiche pour l\'instant.');

  // --- Lecture et transformation des fiches -------------------------------
  const fiches = [];
  for (const relatif of fichiers) {
    const brut = await readFile(path.join(dossierContenu, relatif), 'utf8');
    const analyse = analyserFiche(brut);
    for (const a of analyse.avertissements) avertissements.push(`${relatif} : ${a}`);
    if (analyse.erreurs.length) {
      for (const e of analyse.erreurs) erreurs.push(`${relatif} : ${e}`);
      continue;
    }
    const { meta, brut: sections } = analyse;

    // Identifiant opaque et stable : dérivé du chemin du fichier, il ne révèle
    // rien et survit aux rebuilds comme aux déplacements dans l'arborescence
    // (seul le front-matter porte la catégorie).
    const ficheId = await idStable(relatif);

    const coursHtml = rendreHtml(sections.cours, indexGlossaire, {
      premiereOccurrenceSeulement: config.glossaire.premiereOccurrenceSeulement,
      dejaVus: new Set(),
    });
    const ficheHtml = rendreHtml(sections.fiche, indexGlossaire, {
      premiereOccurrenceSeulement: config.glossaire.premiereOccurrenceSeulement,
      dejaVus: new Set(),
    });

    // L'identifiant d'une carte dépend de sa question : réordonner les cartes
    // ne perd donc pas l'historique de répétition espacée.
    const identifier = async (liste, prefixe) => {
      const sortie = [];
      for (const item of liste) {
        sortie.push({ id: `${ficheId}.${prefixe}${await idStable(ficheId + '|' + item.question, 10)}`, ...item });
      }
      return sortie;
    };
    const flashcards = await identifier(analyse.flashcards, 'c');
    const quiz = await identifier(analyse.quiz, 'q');
    const pretest = await identifier(analyse.pretest, 'p');

    const texteRecherche = [
      meta.titre,
      meta.chemin.join(' '),
      meta.tags.join(' '),
      texteBrut(sections.cours),
      texteBrut(sections.fiche),
      flashcards.map((c) => `${c.question} ${c.reponse}`).join(' '),
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    fiches.push({
      id: ficheId,
      fichier: relatif,
      titre: meta.titre,
      chemin: meta.chemin,
      ordre: meta.ordre,
      tags: meta.tags,
      coursHtml,
      ficheHtml,
      sommaire: extraireSommaire(coursHtml || ficheHtml),
      flashcards,
      quiz,
      pretest,
      texteRecherche,
      motsCours: texteBrut(sections.cours).split(/\s+/).filter(Boolean).length,
      podcast: await audioDisponible(ficheId),
    });
  }

  if (erreurs.length) {
    console.error(couleur.rouge(`\n✖ ${erreurs.length} erreur(s) dans le contenu :`));
    for (const e of erreurs) console.error('  - ' + e);
    console.error(couleur.rouge('\nAucun fichier n\'a été écrit. Corrigez puis relancez.\n'));
    process.exit(1);
  }

  // --- Arborescence, puis vue matière > « fascicule » ----------------------
  // Le reste du site raisonne en matière (premier niveau) et en « fascicule »
  // (le chemin sous la matière, aplati) : statistiques, planning, filtres.
  // L'arborescence complète sert à la bibliothèque et à l'éditeur.
  const arbre = await construireArbre(categories, fiches);
  for (const f of fiches) {
    f.matiere = f.chemin[0];
    f.fascicule = libelleFascicule(f.chemin);
  }

  const resume = (f) => ({
    id: f.id,
    titre: f.titre,
    chemin: f.chemin,
    fichier: f.fichier,
    ordre: f.ordre,
    tags: f.tags,
    nbFlashcards: f.flashcards.length,
    nbQuiz: f.quiz.length,
    nbMots: f.motsCours,
    aCours: Boolean(f.coursHtml),
    aFiche: Boolean(f.ficheHtml),
    aPodcast: Boolean(f.podcast),
    aPretest: f.pretest.length > 0,
  });
  const parId = new Map(fiches.map((f) => [f.id, f]));

  const matieres = [];
  for (const noeudMatiere of arbre) {
    // Parcours en profondeur : les « fascicules » suivent l'ordre de l'arbre.
    const fascicules = [];
    const parcourir = async (noeud) => {
      if (noeud.fiches.length) {
        fascicules.push({
          id: await idStable(`${noeud.chemin.join('|')}`, 12),
          nom: libelleFascicule(noeud.chemin),
          fiches: noeud.fiches.map((id) => resume(parId.get(id))),
        });
      }
      for (const e of noeud.enfants) await parcourir(e);
    };
    await parcourir(noeudMatiere);
    matieres.push({
      id: await idStable(noeudMatiere.nom, 12),
      nom: noeudMatiere.nom,
      icone: noeudMatiere.icone,
      fascicules,
    });
  }

  const manifeste = {
    genereLe: new Date().toISOString(),
    matieres,
    arbre,
    totaux: {
      fiches: fiches.length,
      flashcards: fiches.reduce((n, f) => n + f.flashcards.length, 0),
      quiz: fiches.reduce((n, f) => n + f.quiz.length, 0),
      termesGlossaire: glossaire.length,
      podcasts: fiches.filter((f) => f.podcast).length,
    },
  };

  // --- Chiffrement et écriture -------------------------------------------
  const { iterations, tailleSelOctets, tailleIvOctets, tailleCleBits } = config.crypto;
  // Sel stable, versionné dans « sel.json » (un sel n'est pas un secret) : la
  // clé dérivée reste donc la même d'une publication à l'autre. Sans cela,
  // chaque enregistrement depuis l'éditeur, qui republie le site, obligerait à
  // ressaisir le mot de passe sur tous les appareils. C'est aussi cette clé
  // qui chiffre les fiches sources dans le dépôt GitHub.
  const sel = await lireOuCreerSel(tailleSelOctets);
  const cle = await deriverCle(motDePasse, sel, iterations, tailleCleBits);

  // Pas de « rm -rf » du dossier : pendant « npm run dev », le serveur garde la
  // liste des fichiers publics, et un dossier supprimé puis recréé d'un bloc
  // lui échappe (404 jusqu'au redémarrage). On réécrit, puis on élague.
  await mkdir(path.join(dossierSortie, 'fiches'), { recursive: true });
  const ecrits = new Set();
  const ecrireSortie = async (chemin, donnees) => {
    ecrits.add(path.resolve(chemin));
    await writeFile(chemin, donnees);
  };

  // Identifiant unique de cette publication. Il sert à versionner les URL du
  // contenu : le sel étant régénéré à chaque build, tout est re-chiffré, et un
  // fichier resservi depuis le cache du navigateur ne serait plus déchiffrable
  // par la nouvelle clé. GitHub Pages ne permettant pas de fixer les en-têtes
  // HTTP, c'est l'URL elle-même qui doit changer.
  const version = await idStable(b64(sel) + manifeste.genereLe, 12);

  // Le fichier « cle.json » ne contient aucun secret : seulement les
  // paramètres publics de dérivation, plus un témoin chiffré qui permet au
  // navigateur de vérifier que la clé dérivée est la bonne.
  await ecrireSortie(
    path.join(dossierSortie, 'cle.json'),
    JSON.stringify(
      {
        v: 1,
        version,
        kdf: 'PBKDF2-SHA256',
        iterations,
        sel: b64(sel),
        chiffrement: 'AES-GCM',
        temoin: await chiffrerJson(cle, { ok: true, genereLe: manifeste.genereLe }, tailleIvOctets),
      },
      null,
      2,
    ),
  );

  await ecrireSortie(
    path.join(dossierSortie, 'manifeste.json'),
    JSON.stringify(await chiffrerJson(cle, manifeste, tailleIvOctets)),
  );

  await ecrireSortie(
    path.join(dossierSortie, 'glossaire.json'),
    JSON.stringify(
      await chiffrerJson(
        cle,
        glossaire.map((g) => ({ id: idTerme(g.terme), terme: g.terme, definition: g.definition })),
        tailleIvOctets,
      ),
    ),
  );

  const indexRecherche = fiches.map((f) => ({
    id: f.id,
    titre: f.titre,
    matiere: f.matiere,
    fascicule: f.fascicule,
    chemin: f.chemin,
    tags: f.tags,
    texte: f.texteRecherche.slice(0, 20000),
  }));
  await ecrireSortie(
    path.join(dossierSortie, 'recherche.json'),
    JSON.stringify(await chiffrerJson(cle, indexRecherche, tailleIvOctets)),
  );

  for (const f of fiches) {
    const charge = {
      id: f.id,
      titre: f.titre,
      matiere: f.matiere,
      fascicule: f.fascicule,
      chemin: f.chemin,
      tags: f.tags,
      coursHtml: f.coursHtml,
      ficheHtml: f.ficheHtml,
      sommaire: f.sommaire,
      flashcards: f.flashcards,
      quiz: f.quiz,
      pretest: f.pretest,
      // Le lecteur a besoin de la durée et du poids AVANT de télécharger :
      // c'est ce qui permet d'annoncer « 12 min, 3 Mo » sur le bouton.
      podcast: f.podcast
        ? { secondes: f.podcast.secondes, octets: f.podcast.octets, type: f.podcast.type }
        : null,
    };

    // Cette charge utile est recopiée champ par champ, et une recopie finit
    // toujours par oublier le champ qu'on vient d'ajouter : le prétest a été
    // produit, validé et chiffré sans jamais parvenir au navigateur. Tout champ
    // d'une fiche doit donc être soit transmis, soit écarté explicitement.
    const ECARTES_DU_CLIENT = new Set([
      'fichier', // porté par le manifeste
      'ordre', // porté par le manifeste
      'texteRecherche', // porté par l'index de recherche
      'motsCours', // porté par le manifeste
    ]);
    const oublies = Object.keys(f).filter((c) => !(c in charge) && !ECARTES_DU_CLIENT.has(c));
    if (oublies.length) {
      echouer(
        `Champ(s) de fiche jamais transmis au navigateur : ${oublies.join(', ')}.\n` +
          '  Ajoutez-les à « charge » dans scripts/build-content.mjs, ou inscrivez-les\n' +
          '  dans ECARTES_DU_CLIENT si c\'est délibéré.',
      );
    }

    await ecrireSortie(
      path.join(dossierSortie, 'fiches', `${f.id}.json`),
      JSON.stringify(await chiffrerJson(cle, charge, tailleIvOctets)),
    );
  }

  // --- Fiches audio --------------------------------------------------------
  // Même clé que le reste du contenu : le mot de passe ouvre tout, il n'y a
  // pas de second secret à gérer. Le MP3 en clair reste dans « content/ ».
  const avecAudio = fiches.filter((f) => f.podcast);
  if (avecAudio.length) {
    await mkdir(path.join(dossierSortie, 'audio'), { recursive: true });
    for (const f of avecAudio) {
      const chiffre = await chiffrerBinaire(cle, await readFile(f.podcast.chemin), tailleIvOctets);
      await ecrireSortie(path.join(dossierSortie, 'audio', `${f.id}.enc`), chiffre);
    }
  }

  await elaguer(dossierSortie, ecrits);

  // --- Contrôle final : aucun texte en clair ne doit subsister -------------
  await verifierAucunClair(dossierSortie, fiches);

  const taille = await tailleDossier(dossierSortie);
  console.log(
    couleur.vert('✓') +
      ` ${fiches.length} fiche(s), ${manifeste.totaux.flashcards} flashcard(s), ` +
      `${manifeste.totaux.quiz} question(s) de quiz, ${glossaire.length} terme(s) de glossaire, ` +
      `${manifeste.totaux.podcasts} fiche(s) audio` +
      couleur.gris(` — ${(taille / 1024).toFixed(0)} Ko chiffrés en ${Date.now() - t0} ms`),
  );
  for (const a of avertissements) console.log(couleur.jaune('  ! ' + a));
}

/**
 * Garde-fou : relit les fichiers produits et vérifie qu'aucun titre de fiche
 * n'y apparaît en clair. Protège contre une régression du pipeline.
 */
async function verifierAucunClair(dossier, fiches) {
  const aVerifier = [];
  const audios = [];
  const parcourir = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const c = path.join(d, e.name);
      if (e.isDirectory()) await parcourir(c);
      else if (c.endsWith('.enc')) audios.push(c);
      else aVerifier.push(c);
    }
  };
  await parcourir(dossier);

  const sondes = [
    ...fiches.flatMap((f) => [f.titre, f.matiere]),
  ].filter((s) => s && s.length > 4);

  // Les fiches audio pèsent des centaines de mégaoctets : les passer au crible
  // de toutes les sondes coûterait plus que le reste du build. Chacune n'est
  // confrontée qu'aux siennes — c'est ce qui détecterait un fichier publié
  // par erreur en clair, seul scénario que ce garde-fou vise.
  for (const chemin of audios) {
    const fiche = fiches.find((f) => chemin.endsWith(`${f.id}.enc`));
    if (!fiche) continue;
    const octets = await readFile(chemin);
    for (const sonde of [fiche.titre, fiche.matiere].filter((s) => s && s.length > 4)) {
      if (octets.includes(sonde)) {
        echouer(
          `Fuite détectée : « ${sonde} » apparaît en clair dans ${path.relative(racine, chemin)}.`,
        );
      }
    }
  }

  for (const fichier of aVerifier) {
    const contenu = await readFile(fichier, 'utf8');
    for (const sonde of sondes) {
      if (contenu.includes(sonde)) {
        echouer(
          `Fuite détectée : « ${sonde} » apparaît en clair dans ${path.relative(racine, fichier)}.\n` +
            '  Le build est interrompu pour éviter de publier du contenu lisible.',
        );
      }
    }
  }
}

/** Supprime de la sortie ce que ce build n'a pas écrit (fiches supprimées…). */
async function elaguer(dossier, ecrits) {
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const c = path.join(dossier, e.name);
    if (e.isDirectory()) await elaguer(c, ecrits);
    else if (!ecrits.has(path.resolve(c))) await rm(c, { force: true });
  }
}

async function tailleDossier(dossier) {
  let total = 0;
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    const c = path.join(dossier, e.name);
    total += e.isDirectory() ? await tailleDossier(c) : (await stat(c)).size;
  }
  return total;
}

main().catch((e) => {
  console.error(couleur.rouge('\n✖ Échec du chiffrement du contenu :'), e);
  process.exit(1);
});
