/**
 * Composition d'une session : quelques items tirés dans les moteurs ouverts,
 * chacun **à son propre échelon**.
 *
 * Il n'y a pas de difficulté de session : deux items de la même session peuvent
 * être de niveaux très différents si la personne est plus avancée sur un moteur
 * que sur un autre. C'est le principe de l'échelle par moteur, et c'est aussi ce
 * qui rend la session lisible — on progresse là où l'on est prêt.
 *
 * Le point délicat reste le **refus**. Un moteur rend `null` quand le tirage ne
 * porte pas de réponse unique, et certains couples refusent presque toujours —
 * Réseau relationnel sur « groups », dont les camps sont interchangeables. Une
 * boucle naïve tournerait sans fin. La composition écarte donc un couple après
 * quelques refus consécutifs, et s'arrête proprement si plus aucun ne répond.
 */
import { alea, graineDuMoment } from './noyaux/aleatoire';
import type { Item } from './moteurs/types';
import { couplesOuverts, type Trace } from './progression';

/** Tentatives par couple avant de le mettre de côté pour cette session. */
const REFUS_TOLERES = 12;

export interface Session {
  graine: number;
  items: Item[];
}

export function composerSession(
  traces: readonly Trace[],
  nombre: number,
  graine = graineDuMoment(),
): Session {
  const hasard = alea(graine);
  const disponibles = couplesOuverts(traces).map((couple) => ({ ...couple, refus: 0 }));
  const items: Item[] = [];

  let tentatives = 0;
  const plafond = nombre * REFUS_TOLERES + 50;

  while (items.length < nombre && tentatives < plafond) {
    tentatives += 1;
    const vivants = disponibles.filter((couple) => couple.refus < REFUS_TOLERES);
    if (!vivants.length) break;

    // On préfère le moteur le moins servi, pour que la session balaie les
    // moteurs ouverts au lieu d'insister sur un seul.
    const compte = (id: string) => items.filter((item) => item.moteur === id).length;
    const minimum = Math.min(...vivants.map((couple) => compte(couple.moteur.id)));
    const candidats = vivants.filter((couple) => compte(couple.moteur.id) === minimum);
    const couple = hasard.un(candidats);

    const item = couple.moteur.engendrer(couple.systeme, couple.echelon, hasard);
    if (!item) {
      couple.refus += 1;
      continue;
    }
    couple.refus = 0;
    items.push(item);
  }

  return { graine, items };
}
