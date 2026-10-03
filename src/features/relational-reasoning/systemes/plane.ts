/**
 * Système `plane` : des positions sur une grille, produit de deux algèbres de
 * points.
 *
 * Les axes ne sont pas stricts : deux entités peuvent partager une ligne ou une
 * colonne, ce que le vocabulaire nomme. Elles ne partagent en revanche jamais
 * une case entière dans les instances engendrées — mais « occupe la même case »
 * reste du vocabulaire, car un énoncé qui ne l'exclut pas la laisse possible, et
 * c'est précisément la leçon des moteurs d'indétermination.
 */
import { systemeProduit } from './axes';

export const plane = systemeProduit({
  id: 'plane',
  nom: 'Plan',
  resume: "Des positions sur une grille, repérées par l'est-ouest et le nord-sud.",
  rendu: 'grille',
  axes: [
    {
      id: 'x',
      libelle: "d'ouest en est",
      taille: 5,
      versLeBas: "est à l'ouest de",
      versLeHaut: "est à l'est de",
      egal: 'est sur la même colonne que',
    },
    {
      id: 'y',
      libelle: 'du sud au nord',
      taille: 5,
      versLeBas: 'est au sud de',
      versLeHaut: 'est au nord de',
      egal: 'est sur la même ligne que',
    },
  ],
});
