/**
 * Système `space` : des positions dans un volume, produit de trois algèbres de
 * points.
 *
 * Rien de nouveau au-delà de `plane` sinon un axe : c'est exactement ce que la
 * séparation en deux couches devait produire. Il n'y a pas ici de table de
 * vingt-sept relations écrite à la main — le vocabulaire de surface est engendré
 * par le produit, et « est au nord-est et au-dessus de » se compose axe par axe.
 *
 * L'effet sur les moteurs est mécanique : tous ceux qui exigent `axes.length ≥ 2`
 * gagnent un système, et Projection en gagne deux façons de s'exercer, puisqu'on
 * peut y effondrer un axe et rester en deux dimensions au lieu de tomber sur une
 * ligne.
 */
import { systemeProduit } from './axes';

export const space = systemeProduit({
  id: 'space',
  nom: 'Volume',
  resume: 'Des positions dans un volume, repérées par trois axes.',
  rendu: 'texte',
  axes: [
    {
      id: 'x',
      libelle: "d'ouest en est",
      taille: 4,
      versLeBas: "est à l'ouest de",
      versLeHaut: "est à l'est de",
      egal: 'est sur la même colonne que',
    },
    {
      id: 'y',
      libelle: 'du sud au nord',
      taille: 4,
      versLeBas: 'est au sud de',
      versLeHaut: 'est au nord de',
      egal: 'est sur la même ligne que',
    },
    {
      id: 'z',
      libelle: 'du bas vers le haut',
      taille: 4,
      versLeBas: 'est en dessous de',
      versLeHaut: 'est au-dessus de',
      egal: 'est au même niveau que',
    },
  ],
});
