/**
 * Chargement d'une page : barre de progression et garde-fou.
 *
 * Un seul module pilote les deux, pour qu'ils ne puissent pas diverger :
 * la barre avance parce que le déchiffrement est en cours, atteint 100 % parce
 * qu'il a réellement abouti, et vire à la couleur d'erreur parce qu'il a échoué
 * ou dépassé le délai — jamais sur un minuteur indépendant.
 *
 * Les pages n'appellent qu'une fonction : « auDeverrouillage ».
 */
import { quandDeverrouille } from './auth';
import { chargerManifeste } from './contenu';

/** Au-delà de ce délai, on cesse de faire patienter et on explique. */
const DELAI_MAX_MS = 5000;

/* ══════════════════════════════════════════════════════════════════════════
   Barre de progression
   ══════════════════════════════════════════════════════════════════════════ */

let barre: HTMLElement | null = null;
let jauge: HTMLElement | null = null;
let minuterie: number | null = null;
let avancement = 0;

function elements() {
  barre ??= document.getElementById('barre-progression');
  jauge ??= document.getElementById('barre-progression-jauge');
  return barre && jauge;
}

function poser(valeur: number) {
  avancement = Math.max(0, Math.min(100, valeur));
  if (!elements()) return;
  jauge!.style.width = `${avancement}%`;
  barre!.setAttribute('aria-valuenow', String(Math.round(avancement)));
}

function stopper() {
  if (minuterie !== null) {
    clearInterval(minuterie);
    minuterie = null;
  }
}

/**
 * Démarre la barre.
 *
 * Le déchiffrement est global : le navigateur ne peut pas en mesurer
 * l'avancement réel. On simule donc une montée qui ralentit — rapide au début,
 * asymptotique vers 90 % — plutôt qu'une progression linéaire qui mentirait sur
 * le temps restant. Les 10 derniers pour cent ne sont franchis que lorsque le
 * contenu est vraiment prêt.
 */
export function demarrerChargement() {
  if (!elements()) return;
  stopper();
  barre!.dataset.etat = 'en-cours';
  barre!.removeAttribute('hidden');
  poser(avancement > 0 && avancement < 90 ? avancement : 8);

  minuterie = window.setInterval(() => {
    const reste = 90 - avancement;
    if (reste <= 0.5) return;
    poser(avancement + Math.max(0.4, reste * 0.08));
  }, 180);
}

/** Le contenu est affiché : on complète, puis on efface en fondu. */
export function terminerChargement() {
  if (!elements()) return;
  stopper();
  poser(100);
  barre!.dataset.etat = 'termine';
  window.setTimeout(() => {
    if (barre?.dataset.etat !== 'termine') return; // un autre chargement a repris
    barre.setAttribute('hidden', '');
    poser(0);
  }, 450);
}

/** Le chargement a échoué : la barre se fige et change d'aspect. */
export function echecChargement() {
  if (!elements()) return;
  stopper();
  barre!.dataset.etat = 'erreur';
  barre!.removeAttribute('hidden');
}

/* ══════════════════════════════════════════════════════════════════════════
   Garde-fou
   ══════════════════════════════════════════════════════════════════════════ */

const MESSAGES: Record<string, string> = {
  delai:
    "Le déchiffrement n'a pas abouti dans le délai attendu. " +
    'La page est peut-être encore en train de se charger ; sinon, réessayez.',
  echec: 'Le contenu de cette page n\'a pas pu être déchiffré.',
};

/** Remplace la zone d'attente par un message d'erreur et un bouton de reprise. */
function afficherErreur(zone: HTMLElement, cause: 'delai' | 'echec', detail: string, reprendre: () => void) {
  zone.classList.remove('hidden');
  zone.innerHTML = '';

  const panneau = document.createElement('div');
  panneau.className =
    'mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 px-5 py-6 text-center dark:border-red-900 dark:bg-red-950/40';
  panneau.setAttribute('role', 'alert');

  const titre = document.createElement('p');
  titre.className = 'font-semibold text-red-800 dark:text-red-200';
  titre.textContent = cause === 'delai' ? 'Chargement interrompu' : 'Déchiffrement impossible';

  const texte = document.createElement('p');
  texte.className = 'mt-2 text-sm text-red-700 dark:text-red-300';
  texte.textContent = MESSAGES[cause];

  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className =
    'mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700';
  bouton.textContent = 'Réessayer';
  bouton.addEventListener('click', reprendre);

  panneau.append(titre, texte, bouton);

  if (detail) {
    const technique = document.createElement('p');
    technique.className = 'mt-3 text-xs break-words text-red-600/80 dark:text-red-400/80';
    technique.textContent = detail;
    panneau.appendChild(technique);
  }

  zone.appendChild(panneau);
}

interface Options {
  /** Sélecteur de la zone d'attente à remplacer en cas d'échec. */
  zoneChargement?: string;
  /** Délai au-delà duquel on affiche l'erreur, en millisecondes. */
  delaiMax?: number;
}

/**
 * Exécute le rendu d'une page dès que la session est ouverte, avec barre de
 * progression et garde-fou.
 *
 * Trois issues possibles, et aucune ne laisse l'écran d'attente figé :
 *  • « travail » aboutit          → la barre se complète et disparaît ;
 *  • « travail » échoue           → message d'erreur et bouton « Réessayer » ;
 *  • « travail » dépasse le délai → même chose, avec un message distinct. Si le
 *    travail finit malgré tout par aboutir, l'erreur s'efface d'elle-même.
 */
export function auDeverrouillage(travail: () => void | Promise<void>, options: Options = {}) {
  const { zoneChargement = '#chargement', delaiMax = DELAI_MAX_MS } = options;

  const lancer = () => {
    const zone = document.querySelector<HTMLElement>(zoneChargement);
    demarrerChargement();

    let acheve = false;
    let expire: number | null = null;

    const nettoyer = () => {
      acheve = true;
      if (expire !== null) clearTimeout(expire);
    };

    if (zone) {
      expire = window.setTimeout(() => {
        if (acheve) return;
        echecChargement();
        afficherErreur(zone, 'delai', '', lancer);
      }, delaiMax);
    }

    // Le manifeste (mis en cache) définit les thèmes du planning, dont la
    // série de jours et la planification ont besoin quelle que soit la page.
    chargerManifeste()
      .catch(() => undefined)
      .then(travail)
      .then(() => {
        nettoyer();
        terminerChargement();
      })
      .catch((erreur: unknown) => {
        nettoyer();
        echecChargement();
        const detail = erreur instanceof Error ? erreur.message : String(erreur);
        console.error('Rendu de la page impossible :', erreur);
        if (zone) afficherErreur(zone, 'echec', detail, lancer);
      });
  };

  quandDeverrouille(lancer);
}
