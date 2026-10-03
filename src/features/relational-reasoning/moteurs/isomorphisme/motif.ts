/**
 * Moteur « Recherche de motif » — catégorie Isomorphisme.
 *
 * Un réseau est montré, puis quatre petits motifs de trois ou quatre entités.
 * Un seul apparaît réellement dans le réseau ; il faut dire lequel.
 *
 * Trois décisions font la validité de l'exercice.
 *
 * **La lecture est induite.** Un motif apparaît lorsque non seulement ses arêtes
 * se retrouvent dans le réseau, mais que ses **absences d'arête** s'y retrouvent
 * aussi. Sans cette exigence, un motif à deux arêtes se retrouverait dans presque
 * tout réseau un peu dense et les leurres cesseraient d'être faux. C'est aussi la
 * lecture qui convient au régime clos, où l'absence d'arête est une négation.
 *
 * **Le motif juste est extrait du réseau, les leurres en sont dérivés.** Prendre
 * une sous-structure existante garantit qu'elle apparaît ; muter une de ses
 * arêtes puis vérifier qu'elle n'apparaît plus garantit que le leurre est faux.
 * Tirer les leurres au hasard aurait produit des motifs grossièrement dissemblables,
 * reconnaissables sans examen.
 *
 * **Les entités du motif sont réétiquetées en lettres.** Sans cela le motif
 * porterait les noms de ses entités d'origine, et la réponse se lirait sans
 * regarder la structure.
 */
import { matrice, occurrences, sousMatrice } from '../../noyaux/isomorphisme';
import { blocGraphe, libelle, texte } from '../../noyaux/presentation';
import type { Matrice } from '../../noyaux/isomorphisme';
import type { Alea, Systeme } from '../../systemes/types';
import type { Bloc, Item, Moteur, Option } from '../types';

const LETTRES = ['P', 'Q', 'R', 'S'];

const TIRAGES = 60;
const LEURRES = 3;

/** Le motif, rendu comme un petit graphe sur des lettres. */
function blocMotif(systeme: Systeme, motif: Matrice): Bloc {
  const noeuds = LETTRES.slice(0, motif.length);
  const aretes: { de: string; a: string; libelle: string }[] = [];
  for (let i = 0; i < motif.length; i += 1) {
    for (let j = 0; j < motif.length; j += 1) {
      if (i === j || !motif[i][j]) continue;
      // Une relation symétrique ne se dessine qu'une fois.
      const symetrique = systeme.converse(motif[i][j]) === motif[i][j];
      if (symetrique && j < i) continue;
      aretes.push({ de: noeuds[i], a: noeuds[j], libelle: libelle(systeme, motif[i][j]) });
    }
  }
  return { type: 'graphe', noeuds, aretes };
}

/** Remplace une arête du motif par une autre relation, ou la supprime. */
function muter(motif: Matrice, systeme: Systeme, alea: Alea): Matrice | null {
  const presentes: [number, number][] = [];
  const absentes: [number, number][] = [];
  for (let i = 0; i < motif.length; i += 1) {
    for (let j = 0; j < motif.length; j += 1) {
      if (i === j) continue;
      if (motif[i][j]) presentes.push([i, j]);
      else absentes.push([i, j]);
    }
  }

  const copie = motif.map((ligne) => [...ligne]);
  // Deux mutations possibles : changer l'étiquette d'une arête, ou en ajouter
  // une là où il n'y en avait pas. Retirer une arête ne suffit pas toujours à
  // rendre le motif absent, une sous-structure plus pauvre restant souvent
  // présente ailleurs — la lecture induite l'exclut en principe, mais la
  // vérification ci-dessous tranche de toute façon.
  if (presentes.length && alea.reel() < 0.6) {
    const [i, j] = alea.un(presentes);
    const autres = systeme.relations.filter((r) => r.id !== copie[i][j]);
    if (!autres.length) return null;
    const remplacante = alea.un(autres).id;
    copie[i][j] = remplacante;
    copie[j][i] = systeme.converse(remplacante);
    return copie;
  }
  if (!absentes.length) return null;
  const [i, j] = alea.un(absentes);
  const ajoutee = alea.un(systeme.relations).id;
  copie[i][j] = ajoutee;
  copie[j][i] = systeme.converse(ajoutee);
  return copie;
}

export const rechercheMotif: Moteur = {
  id: 'recherche-motif',
  nom: 'Recherche de motif',
  categorie: 'isomorphisme',
  resume: 'Un seul de ces quatre petits motifs se trouve réellement dans le réseau.',
  // Le moteur ne compose rien : il lit des arêtes. Il tourne donc aussi sur les
  // systèmes du régime clos, qui n'ont pas de table de composition.
  regimes: ['algebre', 'clos'],

  engendrer(systeme: Systeme, echelon: number, alea: Alea): Item | null {
    const taille = echelon < 4 ? 3 : 4;

    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(3, Math.min(echelon + 2, 9)), alea);
      if (instance.entites.length < taille + 1) continue;
      const hote = matrice(systeme, instance);

      // Le motif juste : une sous-structure du réseau, tirée au hasard.
      const indices = alea.plusieurs(
        Array.from({ length: instance.entites.length }, (_, i) => i),
        taille,
      );
      const juste = sousMatrice(hote, indices);

      // Un motif vide ou presque serait vrai partout : on l'écarte.
      const aretes = juste.flat().filter(Boolean).length;
      if (aretes < taille) continue;

      // Un motif qui apparaît partout n'exerce rien : on demande qu'il soit
      // relativement rare dans le réseau.
      const combien = occurrences(juste, hote).length;
      if (combien === 0) continue;

      const faux: Matrice[] = [];
      for (let tentative = 0; tentative < 40 && faux.length < LEURRES; tentative += 1) {
        const candidat = muter(juste, systeme, alea);
        if (!candidat) continue;
        if (occurrences(candidat, hote).length) continue;
        // Pas deux fois le même leurre.
        const deja = faux.some((autre) => JSON.stringify(autre) === JSON.stringify(candidat));
        if (!deja) faux.push(candidat);
      }
      if (faux.length < LEURRES) continue;

      const melange = alea.melanger([
        { motif: juste, bonne: true },
        ...faux.map((motif) => ({ motif, bonne: false })),
      ]);
      const options: Option[] = melange.map((entree) => ({ blocs: [blocMotif(systeme, entree.motif)] }));
      const bonne = melange.findIndex((entree) => entree.bonne);

      return {
        moteur: 'recherche-motif',
        systeme: systeme.id,
        consigne: 'Lequel de ces motifs se trouve dans le réseau ci-dessus ?',
        enonce: [
          texte(
            `${systeme.resume} Un motif « se trouve » dans le réseau lorsqu’on peut en ` +
              'associer les lettres à des entités distinctes de telle sorte que **toutes** les ' +
              'relations du motif s’y retrouvent — et qu’aucune autre relation ne lie ces ' +
              'entités entre elles.',
          ),
          blocGraphe(systeme, instance),
        ],
        reponse: { genre: 'unique', options, bonne },
        explication:
          `Le motif retenu se lit sur ${indices.map((i) => instance.entites[i]).join(', ')}` +
          (combien > 1 ? ` — et sur ${combien - 1} autre${combien > 2 ? 's' : ''} groupe${combien > 2 ? 's' : ''} d’entités` : '') +
          '. Les trois autres diffèrent du réseau par au moins une arête : soit une relation ' +
          'qui n’est pas celle qu’ils annoncent, soit un lien qu’ils ajoutent là où les ' +
          'entités ne sont pas liées.',
      };
    }
    return null;
  },
};
