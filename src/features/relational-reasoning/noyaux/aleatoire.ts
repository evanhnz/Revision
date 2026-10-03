/**
 * Générateur pseudo-aléatoire ensemencé.
 *
 * Ensemencé et non `Math.random` pour deux raisons : un item fautif est
 * reproductible à partir de sa graine, et la revue de fin de session peut
 * réengendrer exactement ce qui a été montré sans avoir à tout garder en
 * mémoire.
 *
 * Algorithme mulberry32 : trente-deux bits d'état, une période largement
 * suffisante pour quelques centaines d'items, et six lignes à lire.
 */
import type { Alea } from '../systemes/types';

export function alea(graine: number): Alea {
  let etat = graine >>> 0;

  function reel(): number {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function entier(borne: number): number {
    return Math.floor(reel() * borne);
  }

  function melanger<T>(liste: readonly T[]): T[] {
    const copie = [...liste];
    // Fisher-Yates, du dernier vers le premier.
    for (let i = copie.length - 1; i > 0; i -= 1) {
      const j = entier(i + 1);
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  }

  return {
    reel,
    entier,
    un: (liste) => liste[entier(liste.length)],
    melanger,
    plusieurs: (liste, combien) => melanger(liste).slice(0, combien),
  };
}

/** Une graine tirée de l'horloge, pour une session nouvelle. */
export function graineDuMoment(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
