/**
 * Affichage des définitions du glossaire.
 *
 * Les termes sont déjà balisés <dfn data-terme="..."> au moment du build.
 * Ici, on branche l'interaction : survol (ordinateur), clic/tap (mobile),
 * clavier (Entrée/Espace), fermeture par Échap.
 *
 * On utilise l'API HTML native « popover » quand elle est disponible, avec un
 * repli en positionnement absolu classique sinon.
 */
import { chargerGlossaire, type TermeGlossaire } from './contenu';

let definitions: Map<string, TermeGlossaire> | null = null;
let bulle: HTMLElement | null = null;
let ancre: HTMLElement | null = null;

const supportePopover = () =>
  typeof HTMLElement !== 'undefined' && HTMLElement.prototype.hasOwnProperty('popover');

function creerBulle(): HTMLElement {
  const element = document.createElement('div');
  element.id = 'bulle-glossaire';
  element.className =
    'fixed z-50 max-w-xs rounded-lg border border-slate-200 bg-white p-3 text-sm leading-snug ' +
    'text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  element.setAttribute('role', 'tooltip');
  if (supportePopover()) element.setAttribute('popover', 'manual');
  else element.style.display = 'none';
  document.body.appendChild(element);
  return element;
}

function fermer() {
  if (!bulle) return;
  if (supportePopover()) {
    try {
      (bulle as HTMLElement & { hidePopover: () => void }).hidePopover();
    } catch {
      /* déjà fermée */
    }
  } else {
    bulle.style.display = 'none';
  }
  ancre?.removeAttribute('aria-describedby');
  ancre?.removeAttribute('data-ouvert');
  ancre = null;
}

function positionner(cible: HTMLElement) {
  if (!bulle) return;
  const rect = cible.getBoundingClientRect();
  const largeur = bulle.offsetWidth || 320;
  const hauteur = bulle.offsetHeight || 80;
  const marge = 8;

  let gauche = rect.left + rect.width / 2 - largeur / 2;
  gauche = Math.max(marge, Math.min(gauche, window.innerWidth - largeur - marge));

  // Au-dessus si la place manque en dessous.
  const enDessous = rect.bottom + marge + hauteur <= window.innerHeight;
  const haut = enDessous ? rect.bottom + marge : Math.max(marge, rect.top - hauteur - marge);

  bulle.style.left = `${Math.round(gauche)}px`;
  bulle.style.top = `${Math.round(haut)}px`;
}

function ouvrir(cible: HTMLElement) {
  const id = cible.dataset.terme;
  if (!id || !definitions) return;
  const entree = definitions.get(id);

  bulle ??= creerBulle();
  bulle.innerHTML = '';

  const titre = document.createElement('p');
  titre.className = 'mb-1 font-semibold text-slate-900 dark:text-white';
  titre.textContent = entree?.terme ?? cible.textContent ?? '';
  const texte = document.createElement('p');
  texte.textContent = entree?.definition ?? 'Définition absente du glossaire.';
  bulle.append(titre, texte);

  if (supportePopover()) {
    try {
      (bulle as HTMLElement & { showPopover: () => void }).showPopover();
    } catch {
      /* déjà ouverte */
    }
  } else {
    bulle.style.display = 'block';
  }

  positionner(cible);
  cible.setAttribute('aria-describedby', 'bulle-glossaire');
  cible.setAttribute('data-ouvert', 'true');
  ancre = cible;
}

/**
 * Active les définitions dans un conteneur donné.
 * À rappeler après chaque insertion de contenu déchiffré dans le DOM.
 */
export async function activerGlossaire(conteneur: HTMLElement | Document = document) {
  if (!definitions) {
    try {
      definitions = new Map((await chargerGlossaire()).map((t) => [t.id, t]));
    } catch {
      definitions = new Map();
    }
  }

  const termes = conteneur.querySelectorAll<HTMLElement>('dfn[data-terme]:not([data-branche])');
  for (const terme of termes) {
    terme.dataset.branche = 'oui';
    terme.setAttribute('tabindex', '0');
    terme.setAttribute('role', 'button');
    terme.setAttribute('aria-label', `Définition de « ${terme.textContent} »`);

    terme.addEventListener('click', (e) => {
      e.preventDefault();
      if (ancre === terme) fermer();
      else ouvrir(terme);
    });
    terme.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ancre === terme ? fermer() : ouvrir(terme);
      }
    });
    // Survol : uniquement sur les appareils à pointeur fin (ordinateur).
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let minuteur: number;
      terme.addEventListener('mouseenter', () => {
        minuteur = window.setTimeout(() => ouvrir(terme), 120);
      });
      terme.addEventListener('mouseleave', () => {
        window.clearTimeout(minuteur);
        window.setTimeout(() => {
          if (ancre === terme && !bulle?.matches(':hover')) fermer();
        }, 180);
      });
    }
  }
}

/** Fermetures globales : Échap, clic extérieur, défilement, redimensionnement. */
export function initGlossaireGlobal() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fermer();
  });
  document.addEventListener('click', (e) => {
    const cible = e.target as HTMLElement;
    if (!ancre) return;
    if (cible === ancre || ancre.contains(cible) || bulle?.contains(cible)) return;
    fermer();
  });
  window.addEventListener('scroll', () => ancre && positionner(ancre), { passive: true });
  window.addEventListener('resize', fermer);
}
