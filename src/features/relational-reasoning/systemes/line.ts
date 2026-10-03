/**
 * Système `line` : des points sur une ligne, sous un ordre strict total.
 *
 * Un seul axe, et strict : deux entités n'occupent jamais la même position, si
 * bien que le vocabulaire se réduit à « avant » et « après ». La composition de
 * deux sens opposés ne laisse donc que ces deux relations, et non trois — c'est
 * tout l'intérêt de l'axe strict, qui évite de faire miroiter une égalité que
 * le système exclut.
 */
import { systemeProduit } from './axes';

export const line = systemeProduit({
  id: 'line',
  nom: 'Ligne',
  resume: 'Des points rangés sur une ligne, du premier au dernier.',
  rendu: 'texte',
  axes: [
    {
      id: 'x',
      libelle: 'du début à la fin',
      taille: 9,
      strict: true,
      versLeBas: 'est avant',
      versLeHaut: 'est après',
      egal: 'est au même rang que',
    },
  ],
});
