/**
 * Moteur « Prémisses minimales » — catégorie Information incomplète.
 *
 * Une conclusion est donnée, ainsi que plus de faits qu'il n'en faut pour
 * l'établir. Il faut cocher exactement ceux qui servent.
 *
 * L'exercice porte sur une distinction que le raisonnement ordinaire brouille
 * volontiers : **entre un fait vrai et un fait utile**. Tous les faits énoncés
 * sont vrais ; seuls certains entrent dans la dérivation. Reconnaître les
 * seconds suppose de suivre la chaîne de composition et non de se fier à la
 * présence des bons noms d'entités — ce que les faits inutiles, qui citent eux
 * aussi les entités de la conclusion, rendent impossible.
 *
 * **L'unicité du sous-ensemble minimal n'est pas garantie en général.** Deux
 * chaînes indépendantes peuvent mener à la même conclusion, et il n'y a alors
 * pas de bonne case à cocher. Le noyau rend le drapeau, et le moteur rejette le
 * tirage — c'est la même exigence que pour Contradiction, et pour la même
 * raison : une question à deux réponses correctes dont une seule est comptée
 * juste est une faute, pas une difficulté.
 */
import { coherent } from '../../noyaux/algebre';
import { plusPetitSuffisant, FAITS_MAXIMUM } from '../../noyaux/mus';
import { blocFaits, libelle, phrase, texte } from '../../noyaux/presentation';
import type { Alea, Fait, Systeme } from '../../systemes/types';
import type { Item, Moteur, Option } from '../types';

const TIRAGES = 60;

export const premissesMinimales: Moteur = {
  id: 'premisses-minimales',
  nom: 'Prémisses minimales',
  categorie: 'incompletude',
  resume: 'Parmi ces faits, cochez ceux qui servent réellement à établir la conclusion.',
  regimes: ['algebre'],
  compatible: (systeme: Systeme) => Boolean(systeme.composer),

  engendrer(systeme: Systeme, echelon: number, alea: Alea): Item | null {
    if (!systeme.composer) return null;
    const algebre = {
      relations: systeme.relations.map((r) => r.id),
      converse: systeme.converse,
      composer: systeme.composer,
    };

    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(3, Math.min(echelon + 1, 7)), alea);
      const n = instance.entites.length;
      if (n < 4 || instance.faits.length > FAITS_MAXIMUM) continue;
      if (!instance.modele) continue;
      const contexte = { algebre, cheminComplet: systeme.cheminComplet, entites: instance.entites };

      // La conclusion porte sur une paire dont aucun fait ne parle
      // directement : sinon la réponse serait ce fait unique, et l'exercice
      // consisterait à le repérer.
      const [a, b] = alea.plusieurs(instance.entites, 2);
      const direct = instance.faits.some(
        (f) => (f.sujet === a && f.objet === b) || (f.sujet === b && f.objet === a),
      );
      if (direct) continue;

      const conclusion = systeme.relationDansModele(instance.modele, a, b);

      // On ajoute des faits vrais mais superflus, qui citent volontiers les
      // entités de la conclusion : c'est ce qui empêche de répondre en
      // repérant les noms.
      const paires: [string, string][] = [];
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const [x, y] = [instance.entites[i], instance.entites[j]];
          if ((x === a && y === b) || (x === b && y === a)) continue;
          const dejaDit = instance.faits.some(
            (f) => (f.sujet === x && f.objet === y) || (f.sujet === y && f.objet === x),
          );
          if (!dejaDit) paires.push([x, y]);
        }
      }
      // Assez de faits inutiles pour que « tout cocher » ne rapporte rien : le
      // barème retranchant les cases fausses des justes, il en faut au moins
      // autant que d'utiles. Les caler sur l'échelon seul ne suffisait pas — un
      // sous-ensemble suffisant de quatre faits noyé dans deux leurres rendait
      // 0,5 à qui cochait tout. On en ajoute donc autant que l'instance en
      // compte, et l'invariant est **vérifié** plus bas sur l'item produit.
      const combien = Math.min(paires.length, Math.max(3, instance.faits.length));
      const superflus: Fait[] = alea.plusieurs(paires, combien).map(([x, y]) => ({
        sujet: x,
        relation: systeme.relationDansModele(instance.modele as never, x, y),
        objet: y,
      }));

      const faits = alea.melanger([...instance.faits, ...superflus]);
      if (faits.length > FAITS_MAXIMUM) continue;
      if (!coherent(algebre, systeme.cheminComplet, instance.entites, faits)) continue;

      const suffisant = plusPetitSuffisant(contexte, faits, a, b, conclusion);
      if (!suffisant || !suffisant.unique) continue;
      // Un sous-ensemble d'un seul fait, ou qui serait l'ensemble entier, ne
      // fait pas travailler la distinction entre vrai et utile.
      if (suffisant.faits.length < 2 || suffisant.faits.length >= faits.length) continue;
      // L'invariant anti-devinette, contrôlé sur l'item lui-même : au moins
      // autant de faits inertes que de faits utiles.
      if (faits.length - suffisant.faits.length < suffisant.faits.length) continue;

      const utiles = new Set(suffisant.faits);
      const options: Option[] = faits.map((fait) => ({ texte: phrase(systeme, fait) }));
      const bonnes = faits.flatMap((fait, i) => (utiles.has(fait) ? [i] : []));

      return {
        moteur: 'premisses-minimales',
        systeme: systeme.id,
        consigne: `Quels faits servent à établir que ${a} ${libelle(systeme, conclusion)} ${b} ?`,
        enonce: [
          texte(
            `${systeme.resume} Tous les faits ci-dessous sont **vrais**, et ils entraînent ` +
              `ensemble que ${a} ${libelle(systeme, conclusion)} ${b}. Mais certains n’y servent ` +
              'à rien. Cochez le plus petit ensemble qui suffit — et lui seul : cocher un fait ' +
              'inutile retire autant qu’un fait utile rapporte.',
          ),
          blocFaits(systeme, faits),
        ],
        reponse: { genre: 'multiple', options, bonnes },
        explication:
          `Il suffit de ${suffisant.faits.length} faits : ` +
          suffisant.faits.map((f) => `« ${phrase(systeme, f)} »`).join(', ') +
          `. Leur composition force la relation « ${libelle(systeme, conclusion)} » entre ` +
          `${a} et ${b} : aucune autre ne reste possible. Les ${faits.length - suffisant.faits.length} ` +
          'autres faits sont vrais mais inertes — les retirer ne change rien à la conclusion, ' +
          'alors que retirer l’un de ceux qui comptent la rend indéterminée. C’est toute la ' +
          'différence entre un fait **vrai** et un fait **utile**.',
      };
    }
    return null;
  },
};
