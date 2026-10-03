/**
 * Mesure du temps de révision effectif.
 *
 * Le compteur se met en pause quand l'onglet passe en arrière-plan ou après
 * deux minutes sans interaction, pour ne pas gonfler artificiellement les
 * statistiques.
 *
 * Subtilité : une écriture IndexedDB est asynchrone et n'a pas le temps
 * d'aboutir quand on quitte la page. Le reliquat est donc déposé de façon
 * synchrone dans localStorage, puis versé en base au chargement suivant.
 */
import { jourISO, majJour } from './db';

const INACTIVITE_MS = 2 * 60 * 1000;
const CLE_TAMPON = 'revinsp.temps-en-attente';

let debut: number | null = null;
let derniereActivite = Date.now();
let cumulNonEnregistre = 0;

function arreter() {
  if (debut === null) return;
  const ecoule = Math.min(Date.now() - debut, INACTIVITE_MS);
  cumulNonEnregistre += ecoule / 1000;
  debut = null;
}

function demarrer() {
  if (debut === null) debut = Date.now();
}

/** Dépose le reliquat dans localStorage (opération synchrone). */
function deposerTampon() {
  arreter();
  const secondes = Math.round(cumulNonEnregistre);
  if (secondes <= 0) return;
  cumulNonEnregistre -= secondes;
  try {
    const jour = jourISO();
    const tampon = JSON.parse(localStorage.getItem(CLE_TAMPON) ?? '{}') as Record<string, number>;
    tampon[jour] = (tampon[jour] ?? 0) + secondes;
    localStorage.setItem(CLE_TAMPON, JSON.stringify(tampon));
  } catch {
    /* navigation privée : le reliquat est simplement perdu */
  }
}

/**
 * Verse en base tout ce qui attend dans le tampon.
 * Le tampon n'est allégé qu'APRÈS une écriture réussie : si la page est
 * détruite au milieu de l'opération, le temps est réécrit au chargement suivant.
 */
async function viderTampon() {
  let tampon: Record<string, number> = {};
  try {
    tampon = JSON.parse(localStorage.getItem(CLE_TAMPON) ?? '{}');
  } catch {
    return;
  }

  const entrees = Object.entries(tampon).filter(([, secondes]) => secondes > 0);
  if (!entrees.length) return;

  for (const [jour, secondes] of entrees) await majJour(jour, { secondes });

  // On ne retire que ce qui vient d'être écrit : un dépôt a pu s'ajouter
  // entre-temps (l'utilisateur continue de lire pendant l'écriture).
  try {
    const actuel: Record<string, number> = JSON.parse(localStorage.getItem(CLE_TAMPON) ?? '{}');
    for (const [jour, secondes] of entrees) {
      const reste = (actuel[jour] ?? 0) - secondes;
      if (reste > 0) actuel[jour] = reste;
      else delete actuel[jour];
    }
    if (Object.keys(actuel).length) localStorage.setItem(CLE_TAMPON, JSON.stringify(actuel));
    else localStorage.removeItem(CLE_TAMPON);
  } catch {
    /* navigation privée */
  }
}

/** Enregistre le temps écoulé : tampon synchrone puis écriture en base. */
async function enregistrer() {
  deposerTampon();
  await viderTampon();
}

/** Démarre le suivi du temps pour la page courante. Retourne l'arrêt. */
export function suivreTemps() {
  // Le reliquat de la page précédente est versé dès l'ouverture.
  void viderTampon();
  demarrer();

  const surActivite = () => {
    derniereActivite = Date.now();
    if (document.visibilityState === 'visible') demarrer();
  };

  const verifierInactivite = () => {
    if (Date.now() - derniereActivite > INACTIVITE_MS) arreter();
  };

  const surVisibilite = () => {
    if (document.visibilityState === 'visible') {
      derniereActivite = Date.now();
      demarrer();
    } else {
      // Dépôt synchrone uniquement : l'onglet peut être suspendu à tout moment,
      // et une écriture IndexedDB interrompue perdrait le temps mesuré.
      deposerTampon();
    }
  };

  for (const evenement of ['pointerdown', 'keydown', 'scroll', 'focus'] as const) {
    window.addEventListener(evenement, surActivite, { passive: true });
  }
  document.addEventListener('visibilitychange', surVisibilite);
  const minuteurInactivite = window.setInterval(verifierInactivite, 15000);
  const minuteurEcriture = window.setInterval(() => void enregistrer(), 30000);
  // pagehide est le dernier moment fiable pour écrire, y compris sur iOS.
  window.addEventListener('pagehide', deposerTampon);
  window.addEventListener('beforeunload', deposerTampon);

  return () => {
    window.clearInterval(minuteurInactivite);
    window.clearInterval(minuteurEcriture);
    void enregistrer();
  };
}
