/**
 * Moteur « Échange d'axes » — catégorie Autres algèbres.
 *
 * Le plan est réfléchi le long de sa diagonale : ce qui était au nord passe à
 * l'est, et réciproquement. Que devient une relation donnée ?
 *
 * C'est la transformation la plus simple à énoncer et la plus instructive à
 * calculer, parce qu'elle sépare nettement deux choses que l'intuition confond :
 * la **relation** et son **nom**. Échanger les axes ne déplace aucune entité — il
 * change le repère. « Au nord de » et « à l'est de » ne sont pas deux faits mais
 * deux lectures du même écart, sur deux axes que l'échange permute.
 *
 * Sur le n-uplet, l'opération est une permutation de deux composantes, et c'est
 * tout. Les diagonales sont les **points fixes** de la transformation — nord-est
 * reste nord-est — ce qui fournit le leurre le plus efficace : croire que
 * l'échange les modifie aussi. Le moteur les propose donc délibérément, une fois
 * sur trois environ, pour que la réponse « rien ne change » soit parfois la bonne.
 */
import { nommerUplet, type AxeProduit } from '../../systemes/axes';
import { blocModele, libelle, texte } from '../../noyaux/presentation';
import type { Alea, Systeme } from '../../systemes/types';
import type { Item, Moteur, Option } from '../types';

const TIRAGES = 40;

export const echangeAxes: Moteur = {
  id: 'echange-axes',
  nom: 'Échange d’axes',
  categorie: 'algebres',
  resume: 'Les deux axes sont permutés : que devient la relation ?',
  regimes: ['algebre', 'transformation'],
  compatible: (systeme: Systeme) => {
    const axes = systeme.axes ?? [];
    if (axes.length < 2) return false;
    // Échanger deux axes n'a de sens que s'ils ont la même structure : permuter
    // un axe strict avec un axe non strict produirait un n-uplet hors
    // vocabulaire, puisque l'égalité n'existe pas sur le premier.
    const produits = axes as AxeProduit[];
    return produits.some((axe, i) =>
      produits.some((autre, j) => j > i && Boolean(axe.strict) === Boolean(autre.strict)),
    );
  },

  engendrer(systeme: Systeme, echelon: number, alea: Alea): Item | null {
    const axes = (systeme.axes ?? []) as AxeProduit[];
    if (axes.length < 2) return null;

    // Deux axes de même nature, tirés au hasard parmi les paires admissibles.
    const pairesAdmissibles: [number, number][] = [];
    for (let i = 0; i < axes.length; i += 1) {
      for (let j = i + 1; j < axes.length; j += 1) {
        if (Boolean(axes[i].strict) === Boolean(axes[j].strict)) pairesAdmissibles.push([i, j]);
      }
    }
    if (!pairesAdmissibles.length) return null;

    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(2, Math.min(echelon, 7)), alea);
      if (!instance.modele?.coordonnees) continue;
      const [a, b] = alea.plusieurs(instance.entites, 2);
      const relation = systeme.relationDansModele(instance.modele, a, b);
      if (relation.length !== axes.length) continue;

      const [i, j] = alea.un(pairesAdmissibles);
      const lettres = relation.split('');
      const permutee = [...lettres];
      permutee[i] = lettres[j];
      permutee[j] = lettres[i];
      const image = permutee.join('');

      // Les leurres : d'autres n-uplets du même vocabulaire. Le plus tentant est
      // la relation d'origine, qu'on inclut toujours — ce qui rend « rien ne
      // change » plausible, et parfois juste, quand la relation est diagonale.
      const vocabulaire = systeme.relations.map((r) => r.id);
      const autres = vocabulaire.filter((uplet) => uplet !== image);
      if (autres.length < 2) continue;
      const obligatoire = autres.includes(relation) ? [relation] : [];
      const complement = alea.plusieurs(
        autres.filter((uplet) => !obligatoire.includes(uplet)),
        Math.min(3 - obligatoire.length, autres.length - obligatoire.length),
      );

      const melange = alea.melanger([image, ...obligatoire, ...complement]);
      const options: Option[] = melange.map((uplet) => ({
        texte: `${a} ${nommerUplet(uplet, axes).libelle} ${b}`,
      }));
      const bonne = melange.indexOf(image);
      if (bonne < 0 || melange.length < 3) continue;

      const pointFixe = image === relation;

      return {
        moteur: 'echange-axes',
        systeme: systeme.id,
        consigne: `Après l’échange des deux axes, quelle relation lie ${a} à ${b} ?`,
        enonce: [
          texte(
            `${systeme.resume} On sait que ${a} ${libelle(systeme, relation)} ${b}. ` +
              `On échange maintenant les axes « ${axes[i].libelle} » et « ${axes[j].libelle} » : ` +
              'ce qui se lisait sur le premier se lit désormais sur le second, et inversement. ' +
              '**Aucune entité ne bouge** — c’est le repère qui change.',
          ),
          blocModele(systeme, instance, [a, b]),
        ],
        reponse: { genre: 'unique', options, bonne },
        explication:
          `La relation « ${libelle(systeme, relation)} » se décompose axe par axe. L’échange ` +
          `permute les composantes des axes « ${axes[i].libelle} » et « ${axes[j].libelle} », ` +
          `ce qui donne « ${nommerUplet(image, axes).libelle} ». ` +
          (pointFixe
            ? 'Ici la relation est **inchangée** : ses deux composantes étaient identiques, ' +
              'et une permutation ne les distingue pas. Les diagonales sont les points fixes de ' +
              'cette transformation — se demander si l’échange les modifie est l’erreur ' +
              'caractéristique.'
            : 'Notez qu’aucune entité n’a bougé : ce sont les mêmes écarts, lus sur des axes ' +
              'échangés. « Au nord de » et « à l’est de » ne sont pas deux faits mais deux ' +
              'lectures.'),
      };
    }
    return null;
  },
};
