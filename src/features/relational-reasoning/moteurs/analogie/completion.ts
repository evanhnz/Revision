/**
 * Moteur « Compléter l'analogie » — catégorie Analogy.
 *
 * Le format A:B::C:? classique, à une différence près qui fait tout l'exercice :
 * **la relation entre A et B n'est jamais nommée**. Il faut l'inférer de la
 * structure montrée avant de pouvoir l'appliquer à C.
 *
 * Le moteur est agnostique du système. Sa seule exigence tient à l'unicité de la
 * réponse : il faut qu'une **seule** entité soit dans la relation cherchée avec
 * C. Sur un ordre total, « avant » vaut pour plusieurs entités à la fois ; le
 * tirage est alors rejeté, faute de quoi l'exercice aurait plusieurs bonnes
 * réponses dont une seule serait comptée juste.
 */
import { blocModele, libelleNu, texte } from '../../noyaux/presentation';
import type { Alea, Systeme } from '../../systemes/types';
import type { Item, Moteur, Option } from '../types';

const TIRAGES = 60;

export const completionAnalogie: Moteur = {
  id: 'completion-analogie',
  nom: "Compléter l'analogie",
  categorie: 'analogie',
  resume: 'A est à B ce que C est à… ? La relation n’est pas nommée : il faut la deviner.',
  regimes: ['algebre', 'clos'],

  engendrer(systeme: Systeme, difficulte: number, alea: Alea): Item | null {
    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(4, difficulte + 2), alea);
      const modele = instance.modele;
      if (!modele || instance.entites.length < 4) continue;

      const relation = alea.un(systeme.relations).id;

      // Les entités qui sont dans cette relation avec exactement une autre :
      // ce sont les seules qui peuvent tenir le rôle de C.
      const cibleUnique = new Map<string, string>();
      for (const source of instance.entites) {
        const atteintes = instance.entites.filter(
          (cible) => cible !== source && systeme.relationDansModele(modele, source, cible) === relation,
        );
        if (atteintes.length === 1) cibleUnique.set(source, atteintes[0]);
      }
      if (cibleUnique.size < 2) continue;

      const [premier, second] = alea.plusieurs([...cibleUnique.keys()], 2);
      const a = premier;
      const b = cibleUnique.get(premier)!;
      const c = second;
      const d = cibleUnique.get(second)!;
      if (new Set([a, b, c, d]).size < 3) continue;

      const leurres = instance.entites.filter((entite) => entite !== c && entite !== d);
      if (leurres.length < 2) continue;

      const options: Option[] = alea.melanger([
        { texte: d },
        ...alea.plusieurs(leurres, Math.min(3, leurres.length)).map((entite) => ({ texte: entite })),
      ]);

      return {
        moteur: 'completion-analogie',
        systeme: systeme.id,
        consigne: `${a} est à ${b} ce que ${c} est à… ?`,
        enonce: [
          texte(`Voici la structure. ${systeme.resume}`),
          blocModele(systeme, instance, [a, b, c]),
          texte(
            `Une relation lie ${a} à ${b}. Elle n’est pas nommée : à vous de la lire sur la ` +
              `structure, puis de l’appliquer à ${c}.`,
          ),
        ],
        reponse: {
          genre: 'unique',
          options,
          bonne: options.findIndex((option) => option.texte === d),
        },
        explication:
          `La relation qui lie ${a} à ${b} est « ${libelleNu(systeme, relation)} ». Appliquée à ` +
          `${c}, elle désigne ${d}, et ${d} seul : aucune autre entité n’est ` +
          `${libelleNu(systeme, relation)} ${c}.`,
      };
    }
    return null;
  },
};
