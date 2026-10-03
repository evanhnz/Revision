/**
 * Masque de débordement pour les rubans défilant horizontalement.
 *
 * Une barre de défilement sous une rangée d'icônes est une gêne : elle occupe
 * de la hauteur, tranche sur le fond et n'apprend rien que le contenu ne dise
 * déjà. On la masque donc, et on la remplace par un dégradé d'estompe aux
 * bords — du côté, et seulement du côté, où il reste quelque chose à voir.
 */

/** Tolérance d'arrondi : les largeurs sont fractionnaires après mise à l'échelle. */
const MARGE = 2;

/**
 * Pose sur l'élément un attribut « data-deborde » valant « aucun », « debut »,
 * « fin » ou « deux », que la feuille de style traduit en estompe.
 * Renvoie la fonction de mesure, au cas où l'appelant veuille la déclencher.
 */
export function masquerDebordement(element: HTMLElement) {
  const mesurer = () => {
    const avant = element.scrollLeft > MARGE;
    const apres = element.scrollLeft + element.clientWidth < element.scrollWidth - MARGE;
    element.dataset.deborde = avant && apres ? 'deux' : avant ? 'debut' : apres ? 'fin' : 'aucun';
  };

  element.addEventListener('scroll', mesurer, { passive: true });
  window.addEventListener('resize', mesurer);
  // Les polices et les emojis arrivent après le premier rendu et changent la
  // largeur du ruban : une simple mesure au chargement serait vite fausse.
  if ('ResizeObserver' in window) new ResizeObserver(mesurer).observe(element);

  mesurer();
  return mesurer;
}
