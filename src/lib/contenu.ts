/**
 * Chargement du contenu chiffré et mise en cache mémoire après déchiffrement.
 * Rien n'est jamais écrit en clair sur le disque : tout reste en mémoire vive
 * pour la durée de l'onglet.
 */
import { dechiffrerBinaire, dechiffrerJson, type Blob as BlobChiffre, type ParametresCle } from './crypto';
import { obtenirCle } from './auth';
import { definirThemes } from './rotation';

export interface FicheResume {
  id: string;
  titre: string;
  /** Chemin complet dans l'arborescence, matière comprise. */
  chemin: string[];
  /** Fichier source, relatif à content/ : c'est ce que l'éditeur ouvre. */
  fichier: string;
  ordre: number;
  tags: string[];
  nbFlashcards: number;
  nbQuiz: number;
  nbMots: number;
  aCours: boolean;
  aFiche: boolean;
  /** Une fiche audio a-t-elle été synthétisée pour cette fiche ? */
  aPodcast?: boolean;
  /**
   * La fiche propose-t-elle un prétest ? Annoncé par le manifeste pour que la
   * séance n'ait pas à déchiffrer une fiche entière afin de le découvrir.
   */
  aPretest?: boolean;
}

export interface Fascicule {
  id: string;
  nom: string;
  fiches: FicheResume[];
}

export interface Matiere {
  id: string;
  nom: string;
  icone?: string;
  fascicules: Fascicule[];
}

export interface ParametresPublics extends ParametresCle {
  /** Identifiant de la publication, utilisé pour versionner les URL. */
  version?: string;
}

/** Une catégorie de l'arborescence, avec ses fiches et ses sous-catégories. */
export interface NoeudArbre {
  id: string;
  nom: string;
  chemin: string[];
  icone?: string;
  /** Identifiants des fiches rangées directement ici, dans l'ordre. */
  fiches: string[];
  enfants: NoeudArbre[];
}

export interface Manifeste {
  genereLe: string;
  matieres: Matiere[];
  arbre: NoeudArbre[];
  totaux: {
    fiches: number;
    flashcards: number;
    quiz: number;
    termesGlossaire: number;
    podcasts?: number;
    qcmDgfip?: number;
  };
}

export interface Flashcard {
  id: string;
  question: string;
  reponse: string;
}

export interface QuestionQuiz {
  id: string;
  question: string;
  options: string[];
  bonnes: number[];
  explication?: string;
}

export interface Fiche {
  id: string;
  titre: string;
  matiere: string;
  fascicule: string;
  chemin: string[];
  tags: string[];
  coursHtml: string;
  ficheHtml: string;
  sommaire: { niveau: number; id: string; titre: string }[];
  flashcards: Flashcard[];
  quiz: QuestionQuiz[];
  /**
   * Questions posées **avant** la première lecture du cours. Facultatif : les
   * fiches écrites avant la phase 10b n'en ont pas.
   */
  pretest?: QuestionQuiz[];
  /** Durée, poids et format de la fiche audio, connus avant de la télécharger. */
  podcast: { secondes: number | null; octets: number; type: string } | null;
}

export interface TermeGlossaire {
  id: string;
  terme: string;
  definition: string;
}

export interface EntreeRecherche {
  id: string;
  titre: string;
  matiere: string;
  fascicule: string;
  chemin: string[];
  tags: string[];
  texte: string;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const urlData = (chemin: string) => `${base}/data/${chemin}`;

const cache = new Map<string, unknown>();

let promesseParametres: Promise<ParametresPublics> | null = null;

/**
 * Charge les paramètres publics de chiffrement.
 * Toujours revalidé auprès du serveur : c'est ce fichier qui porte le numéro
 * de publication dont dépendent toutes les autres URL.
 */
export function chargerParametresCle(): Promise<ParametresPublics> {
  promesseParametres ??= (async () => {
    const reponse = await fetch(urlData('cle.json'), { cache: 'no-cache' });
    if (!reponse.ok) throw new Error('Paramètres de chiffrement introuvables (data/cle.json).');
    return reponse.json() as Promise<ParametresPublics>;
  })().catch((erreur) => {
    promesseParametres = null; // un échec réseau ne doit pas être mémorisé
    throw erreur;
  });
  return promesseParametres;
}

/** Récupère un fichier chiffré et le déchiffre, avec cache mémoire. */
async function charger<T>(chemin: string): Promise<T> {
  if (cache.has(chemin)) return cache.get(chemin) as T;

  const cle = await obtenirCle();
  if (!cle) throw new Error('Session verrouillée.');

  // La version en paramètre d'URL garantit qu'un fichier mis en cache par une
  // publication précédente n'est jamais resservi : il aurait été chiffré avec
  // une autre clé et serait illisible.
  const { version } = await chargerParametresCle();
  const url = version ? `${urlData(chemin)}?v=${encodeURIComponent(version)}` : urlData(chemin);

  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Contenu introuvable : ${chemin}`);
  const blob: BlobChiffre = await reponse.json();

  let valeur: T;
  try {
    valeur = await dechiffrerJson<T>(cle, blob);
  } catch {
    // Seul cas plausible : le fichier vient d'une autre publication que la clé.
    throw new Error(
      'Ce contenu ne correspond pas à la clé de la session. ' +
        'Le site a été republié entre-temps : rechargez la page (Ctrl+Maj+R), ' +
        'puis ressaisissez le mot de passe si besoin.',
    );
  }

  cache.set(chemin, valeur);
  return valeur;
}

/**
 * Récupère un fichier chiffré binaire (fiche audio) et le déchiffre.
 *
 * Volontairement hors du cache mémoire : un podcast pèse plusieurs
 * mégaoctets, les garder tous ouverts remplirait l'onglet pour rien.
 */
export async function chargerBinaire(chemin: string): Promise<ArrayBuffer> {
  const cle = await obtenirCle();
  if (!cle) throw new Error('Session verrouillée.');

  const { version } = await chargerParametresCle();
  const url = version ? `${urlData(chemin)}?v=${encodeURIComponent(version)}` : urlData(chemin);

  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Contenu introuvable : ${chemin}`);
  try {
    return await dechiffrerBinaire(cle, await reponse.arrayBuffer());
  } catch {
    throw new Error(
      'Ce contenu ne correspond pas à la clé de la session. ' +
        'Le site a été republié entre-temps : rechargez la page (Ctrl+Maj+R).',
    );
  }
}

export const chargerManifeste = async () => {
  const manifeste = await charger<Manifeste>('manifeste.json');
  // Les thèmes du planning suivent les matières : en ajouter une la rend
  // aussitôt assignable à un jour de la semaine.
  definirThemes(manifeste.matieres);
  return manifeste;
};
export const chargerFiche = (id: string) => charger<Fiche>(`fiches/${id}.json`);
export const chargerGlossaire = () => charger<TermeGlossaire[]>('glossaire.json');
export const chargerIndexRecherche = () => charger<EntreeRecherche[]>('recherche.json');


/** Vide le cache mémoire (au verrouillage de la session). */
export function viderCache() {
  cache.clear();
  promesseParametres = null;
}

/** Liste à plat de toutes les fiches, avec leur matière et leur fascicule. */
export function aplatirFiches(manifeste: Manifeste) {
  return manifeste.matieres.flatMap((m) =>
    m.fascicules.flatMap((f) =>
      f.fiches.map((fiche) => ({
        ...fiche,
        matiere: m.nom,
        matiereId: m.id,
        fascicule: f.nom,
        fasciculeId: f.id,
      })),
    ),
  );
}

export type FicheAplatie = ReturnType<typeof aplatirFiches>[number];

/*
   Les étiquettes qui désignent un contenu écarté (matière de cas pratique, tag
   de méthodologie) vivent dans « contenu-ecarte.ts » : ce module-ci tire le
   chargement chiffré et l'environnement Astro derrière lui, et l'estimation de
   niveau a besoin des étiquettes sans avoir besoin de tout cela. Réexportées
   ici pour que l'import reste naturel depuis le contenu.
*/
export {
  estMethodologique,
  MATIERE_CAS_PRATIQUE,
  TAG_METHODOLOGIE,
} from './contenu-ecarte';
