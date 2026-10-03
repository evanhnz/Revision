/**
 * Les deux moteurs de synthèse vocale, et où trouver leurs modèles.
 *
 * Partagé par l'installateur et par la génération des podcasts, pour que le
 * chemin d'un modèle ne soit décrit qu'une fois.
 *
 * Les modèles sont récupérés depuis les publications de « sherpa-onnx » sur
 * GitHub, qui redistribuent les modèles officiels (Kokoro est publié sur
 * Hugging Face, Piper également) : un seul domaine à joindre, celui qui sert
 * déjà à publier le site.
 */
import path from 'node:path';

const PUBLICATIONS = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models';

export const MOTEURS = {
  kokoro: {
    paquet: 'sherpa-onnx',
    module: 'sherpa_onnx',
    poids: '≈ 390 Mo',
    /** Le modèle est multilingue : un seul fichier, plusieurs dizaines de voix. */
    dossier: (podcast) => podcast.kokoro.modele,
    fichier: () => 'model.onnx',
    url: (podcast) => `${PUBLICATIONS}/${podcast.kokoro.modele}.tar.bz2`,
  },
  piper: {
    paquet: 'piper-tts',
    module: 'piper',
    poids: '≈ 65 Mo',
    /** Chez Piper, une voix = un modèle : tous cohabitent dans le même dossier. */
    dossier: () => 'piper',
    fichier: (podcast) => `${podcast.piper.voix}.onnx`,
    url: (podcast) => `${PUBLICATIONS}/vits-piper-${podcast.piper.voix}.tar.bz2`,
    /** L'archive Piper embarque aussi les données espeak, déjà dans le paquet Python. */
    garder: (nom) => nom.endsWith('.onnx') || nom.endsWith('.onnx.json'),
  },
};

/**
 * Formats d'encodage proposés.
 *
 * Opus est le bon choix pour de la parole : à 16 kbit/s en mono, il reste
 * parfaitement intelligible là où le MP3 devient pâteux, et divise le poids
 * publié par deux. Le MP3 ne subsiste que pour un navigateur ancien qui ne
 * saurait pas lire de l'Opus.
 */
export const FORMATS = {
  opus: { extension: 'opus', type: 'audio/ogg; codecs=opus' },
  mp3: { extension: 'mp3', type: 'audio/mpeg' },
};

/** Extension du fichier audio produit, et type MIME correspondant. */
export function formatAudio(podcast) {
  const format = FORMATS[podcast.format];
  if (!format) throw new Error(`Format audio inconnu : « ${podcast.format} ».`);
  return format;
}

/** Chemin du fichier de modèle attendu pour le moteur configuré. */
export function cheminModele(racine, podcast) {
  const moteur = MOTEURS[podcast.moteur];
  if (!moteur) throw new Error(`Moteur de synthèse inconnu : « ${podcast.moteur} ».`);
  return path.join(racine, 'outils', moteur.dossier(podcast), moteur.fichier(podcast));
}
