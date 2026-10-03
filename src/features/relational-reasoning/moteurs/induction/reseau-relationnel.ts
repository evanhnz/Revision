/**
 * Moteur « Réseau relationnel » — catégorie Induction.
 *
 * Le même réseau est montré deux fois : une fois avec ses étiquettes, une fois
 * entièrement réétiqueté et réordonné. La personne apparie chaque entité à son
 * équivalent, par la seule structure.
 *
 * Deux précautions décident de la validité de l'exercice.
 *
 * **Les deux réseaux sont montrés en matrice, non en dessin.** Le cahier des
 * charges demande que la disposition ne donne aucun indice ; une matrice n'a pas
 * de disposition, et elle reste lisible là où un ordre total sur cinq entités
 * donnerait dix arêtes illisibles.
 *
 * **La structure doit être rigide.** Si elle admet une symétrie non triviale,
 * deux appariements différents sont tous deux corrects et corriger l'un comme
 * faux serait une faute. Le moteur retire donc jusqu'à quarante fois, puis
 * renonce — c'est notamment le cas de `groups`, dont les camps sont
 * interchangeables par construction et qui n'y parvient presque jamais.
 */
import { blocMatrice, texte } from '../../noyaux/presentation';
import { reetiqueter, rigide } from '../../noyaux/isomorphisme';
import type { Alea, Systeme } from '../../systemes/types';
import type { Item, Moteur } from '../types';

const GRECS = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ'];

const TIRAGES = 40;

export const reseauRelationnel: Moteur = {
  id: 'reseau-relationnel',
  nom: 'Réseau relationnel',
  categorie: 'induction',
  resume: 'Le même réseau, réétiqueté : retrouvez qui est qui, par la structure seule.',
  regimes: ['algebre', 'clos'],

  engendrer(systeme: Systeme, difficulte: number, alea: Alea): Item | null {
    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(2, Math.min(difficulte, 8)), alea);
      if (instance.entites.length < 3 || instance.entites.length > GRECS.length) continue;
      if (!rigide(systeme, instance)) continue;

      const n = instance.entites.length;
      const ordreAffichage = alea.melanger(Array.from({ length: n }, (_, i) => i));
      const { instance: copie, correspondance } = reetiqueter(
        instance,
        GRECS.slice(0, n),
        ordreAffichage,
      );

      return {
        moteur: 'reseau-relationnel',
        systeme: systeme.id,
        consigne: 'Quelle entité grecque correspond à quelle entité du premier réseau ?',
        enonce: [
          texte('Premier réseau — chaque case dit la relation de la ligne vers la colonne.'),
          blocMatrice(systeme, instance),
          texte(
            'Second réseau — le même, réétiqueté et réordonné. Ni les noms ni l’ordre des ' +
              'lignes ne vous aideront : seule la structure le fera.',
          ),
          blocMatrice(systeme, copie),
        ],
        reponse: {
          genre: 'appariement',
          gauche: instance.entites,
          droite: alea.melanger(copie.entites),
          paires: correspondance,
        },
        explication:
          'L’appariement est ' +
          instance.entites.map((entite) => `${entite} → ${correspondance[entite]}`).join(', ') +
          '. Il est unique parce que la structure n’admet aucune symétrie : ' +
          'aucune permutation des entités autre que l’identité ne laisse toutes les ' +
          'relations inchangées.',
      };
    }
    return null;
  },
};
