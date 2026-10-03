/**
 * Catalogue des systèmes.
 *
 * Les moteurs n'importent jamais un système par son nom : ils reçoivent celui
 * que la session a choisi. Ce fichier est le seul endroit où la liste existe.
 */
import type { Systeme } from './types';
import { groups } from './groups';
import { line } from './line';
import { plane } from './plane';
import { digraph } from './digraph';
import { poset, posetOuvert } from './poset';
import { space } from './space';
import { cyclic } from './cyclic';
import { allen } from './allen';
import { rcc8 } from './rcc8';

export const SYSTEMES: Systeme[] = [
  line,
  plane,
  groups,
  digraph,
  poset,
  posetOuvert,
  space,
  cyclic,
  rcc8,
  allen,
];

export function systemeParId(id: string): Systeme | undefined {
  return SYSTEMES.find((systeme) => systeme.id === id);
}

export type { Systeme };
