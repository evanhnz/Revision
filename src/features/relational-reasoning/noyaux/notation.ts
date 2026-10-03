/**
 * Notation d'une réponse, de 0 à 1.
 *
 * L'enjeu tient entièrement aux questions à sélection multiple. Elles servent
 * les moteurs d'indétermination, où « ça pourrait être l'un ou l'autre » est une
 * réponse légitime — et si l'indétermination est une réponse, la deviner ne doit
 * pas payer. Le barème répond donc à trois exigences à la fois :
 *
 *  - une réponse exacte et complète vaut 1 ;
 *  - une réponse partiellement juste vaut plus qu'une réponse fausse et moins
 *    qu'une réponse exacte ;
 *  - **tout cocher ne rapporte rien**, alors qu'un décompte des seules bonnes
 *    cases donnerait la note maximale à ce réflexe.
 *
 * La formule qui satisfait les trois est simple : on compte les bonnes cases
 * cochées, on retranche les mauvaises, on rapporte au nombre de bonnes. Cocher
 * tout donne donc (bonnes − mauvaises) / bonnes, qui tombe à zéro ou au-dessous
 * dès que les leurres sont au moins aussi nombreux que les bonnes réponses — ce
 * que les générateurs garantissent.
 */
import type { Reponse } from '../moteurs/types';

/** Ce que la personne a fourni, dans la forme qu'impose le genre de question. */
export type Donnee =
  | { genre: 'unique'; choix: number | null }
  | { genre: 'multiple'; choix: number[] }
  | { genre: 'appariement'; paires: Record<string, string> };

export function noter(attendue: Reponse, donnee: Donnee): number {
  if (attendue.genre === 'unique' && donnee.genre === 'unique') {
    return donnee.choix === attendue.bonne ? 1 : 0;
  }

  if (attendue.genre === 'multiple' && donnee.genre === 'multiple') {
    const bonnes = new Set(attendue.bonnes);
    const cochees = new Set(donnee.choix);
    let justes = 0;
    let fautes = 0;
    for (const index of cochees) {
      if (bonnes.has(index)) justes += 1;
      else fautes += 1;
    }
    if (!bonnes.size) return fautes ? 0 : 1;
    return Math.max(0, Math.min(1, (justes - fautes) / bonnes.size));
  }

  if (attendue.genre === 'appariement' && donnee.genre === 'appariement') {
    // L'appariement est noté par fraction de paires justes, mais l'échelon de
    // difficulté ne monte que sur un sans-faute : voir « credit » plus bas.
    if (!attendue.gauche.length) return 1;
    const justes = attendue.gauche.filter(
      (clef) => donnee.paires[clef] === attendue.paires[clef],
    ).length;
    return justes / attendue.gauche.length;
  }

  return 0;
}

/**
 * Ce qu'une note fait à l'échelon du moteur.
 *
 * Une réponse exacte fait monter, une réponse fausse fait redescendre, et une
 * réponse partielle **maintient** : elle témoigne d'une compréhension réelle de
 * l'indétermination sans démontrer la maîtrise, et la faire compter dans un sens
 * ou dans l'autre serait injuste des deux côtés.
 */
export function credit(note: number): -1 | 0 | 1 {
  if (note >= 1) return 1;
  if (note <= 0) return -1;
  return 0;
}
