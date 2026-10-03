/**
 * Moteur « Algèbre cachée » — catégorie Isomorphism.
 *
 * Un verbe inventé relie quelques entités. La personne dit, du seul motif des
 * arêtes, quelle algèbre abstraite ce verbe instancie ; puis, sous l'algèbre
 * ainsi identifiée, prédit une relation qui ne lui a pas été montrée.
 *
 * Deux difficultés ont décidé de la forme de l'énoncé.
 *
 * **Un diagramme de flèches ne suffit pas.** Une chaîne « a → b → c » est
 * compatible avec un ordre comme avec une succession : la première est
 * transitive, la seconde non, et l'absence de la flèche « a → c » ne se lit pas
 * sur un dessin où l'on ne montre que ce qui est vrai. L'énoncé déclare donc
 * explicitement que les paires listées sont les seules — un monde clos sur la
 * relation montrée — ce qui rend la transitivité lisible.
 *
 * **L'étiquette déclarée par le système ne fait pas foi.** Rien ne garantit
 * qu'un tirage exhibe le motif de l'algèbre annoncée : trois paires d'un ordre
 * total peuvent ne montrer qu'une arborescence. Le moteur classe donc ce qui est
 * réellement montré, exige qu'une seule algèbre le décrive, et rejette le
 * tirage si la classification s'écarte de l'algèbre déclarée.
 *
 * Le second temps n'est posé que pour les algèbres **transitives**, où ce qui
 * découle d'un fait nouveau se calcule par simple clôture. Pour une opposition,
 * l'implication passe par la relation complémentaire et sortirait du verbe
 * montré : mieux vaut ne pas poser la question que la poser mal.
 */
import { classer, INTITULES } from '../../noyaux/proprietes';
import { texte } from '../../noyaux/presentation';
import type { Alea, AlgebreAbstraite, Systeme } from '../../systemes/types';
import type { Item, Moteur, Option } from '../types';

const VERBES = ['gorpe', 'zilme', 'traque', 'vandre', 'norfe', 'quibe'];

const TIRAGES = 60;

/** Clôture transitive, et symétrique quand la relation l'est. */
function cloture(paires: [string, string][], symetrique: boolean): Set<string> {
  const presentes = new Set(paires.map(([a, b]) => `${a}|${b}`));
  let change = true;
  while (change) {
    change = false;
    for (const clef of [...presentes]) {
      const [a, b] = clef.split('|');
      if (symetrique && !presentes.has(`${b}|${a}`)) {
        presentes.add(`${b}|${a}`);
        change = true;
      }
      for (const autre of [...presentes]) {
        const [c, d] = autre.split('|');
        if (b !== c || a === d) continue;
        if (!presentes.has(`${a}|${d}`)) {
          presentes.add(`${a}|${d}`);
          change = true;
        }
      }
    }
  }
  return presentes;
}

const TRANSITIVES: AlgebreAbstraite[] = ['ordre', 'equivalence', 'ascendance'];

export const algebreCachee: Moteur = {
  id: 'algebre-cachee',
  nom: 'Algèbre cachée',
  categorie: 'isomorphisme',
  resume: "Un verbe inventé relie des entités : dites quelle algèbre il instancie.",
  regimes: ['algebre', 'clos'],

  engendrer(systeme: Systeme, difficulte: number, alea: Alea): Item | null {
    const candidates = systeme.relations.filter((r) => r.algebre);
    if (!candidates.length) return null;

    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(4, difficulte + 3), alea);
      const modele = instance.modele;
      if (!modele || instance.entites.length < 4) continue;

      // Une entité est mise de côté : elle servira au second temps, et ne doit
      // donc apparaître dans aucune paire du premier.
      const reserve = instance.entites[instance.entites.length - 1];
      const montrees = instance.entites.slice(0, -1);

      const relation = alea.un(candidates);
      const symetrique = systeme.converse(relation.id) === relation.id;

      // **Les deux sens sont listés pour une relation symétrique.** La symétrie
      // n'est pas une information à cacher : c'est elle qui distingue une
      // équivalence d'un ordre, et sans elle l'énoncé ne porterait pas sa
      // réponse. Un premier jet n'affichait qu'un sens, et une équivalence s'y
      // lisait comme un ordre total — c'est ce que « npm run
      // essais:relationnel » a pris au vol, en reclassant le motif affiché.
      const paires: [string, string][] = [];
      for (const a of montrees) {
        for (const b of montrees) {
          if (a === b) continue;
          if (systeme.relationDansModele(modele, a, b) !== relation.id) continue;
          paires.push([a, b]);
        }
      }

      // On ne parle que des entités effectivement reliées : une entité citée
      // sans qu'aucune paire la concerne changerait la lecture de la totalité et
      // de la bipartition, sans rien apporter à l'énoncé.
      const enJeu = [...new Set(paires.flat())];
      if (enJeu.length < 3) continue;

      const exhibee = classer(enJeu, paires);
      if (!exhibee || exhibee !== relation.algebre) continue;

      const verbe = alea.un(VERBES);
      const lignes = paires.map(([a, b]) => `${a} ${verbe} ${b}.`);

      const options: Option[] = alea.melanger(
        (Object.keys(INTITULES) as AlgebreAbstraite[]).map((nom) => ({ texte: INTITULES[nom] })),
      );
      const bonne = options.findIndex((option) => option.texte === INTITULES[exhibee]);

      const item: Item = {
        moteur: 'algebre-cachee',
        systeme: systeme.id,
        consigne: `Quelle algèbre le verbe « ${verbe} » instancie-t-il ?`,
        enonce: [
          texte(
            `Voici tout ce que l’on sait de « ${verbe} » entre ${enJeu.join(', ')}. ` +
              'Les paires listées sont les seules : toute paire absente de la liste n’est ' +
              'pas dans la relation.',
          ),
          { type: 'faits', phrases: lignes },
        ],
        reponse: { genre: 'unique', options, bonne },
        explication:
          `Le motif est ${INTITULES[exhibee]}. ` +
          (symetrique
            ? 'La relation joue dans les deux sens, ce qui écarte toutes les algèbres orientées. '
            : 'La relation ne joue que dans un sens, ce qui écarte les algèbres symétriques. ') +
          (TRANSITIVES.includes(exhibee)
            ? 'Et elle est transitive : chaque fois que deux paires s’enchaînent, la paire ' +
              'directe figure aussi dans la liste.'
            : 'Et elle n’est pas transitive : deux paires s’enchaînent sans que la ' +
              'paire directe figure dans la liste.'),
      };

      // Second temps, réservé aux algèbres transitives : ce qui découle d'un
      // fait nouveau s'y calcule par clôture, sans sortir du verbe montré.
      if (TRANSITIVES.includes(exhibee)) {
        const point = alea.un(enJeu);
        const avec: [string, string][] = [...paires, [reserve, point]];
        const fermee = cloture(avec, symetrique);
        const enonces = new Set(avec.map(([a, b]) => `${a}|${b}`));

        const decoulent = enJeu.filter(
          (cible) => cible !== point && fermee.has(`${reserve}|${cible}`) && !enonces.has(`${reserve}|${cible}`),
        );
        const necoulentPas = enJeu.filter(
          (cible) => cible !== point && !fermee.has(`${reserve}|${cible}`),
        );

        if (decoulent.length >= 1 && necoulentPas.length >= 2) {
          const vraie = alea.un(decoulent);
          const fausses = alea.plusieurs(necoulentPas, Math.min(3, necoulentPas.length));
          const choix: Option[] = alea.melanger([
            { texte: `${reserve} ${verbe} ${vraie}` },
            ...fausses.map((cible) => ({ texte: `${reserve} ${verbe} ${cible}` })),
          ]);
          item.suite = {
            consigne: 'Sous cette algèbre, quel énoncé découle nécessairement ?',
            enonce: [
              texte(
                `On apprend que ${reserve} ${verbe} ${point}. Les paires du premier temps ` +
                  'restent valables.',
              ),
            ],
            reponse: {
              genre: 'unique',
              options: choix,
              bonne: choix.findIndex((option) => option.texte === `${reserve} ${verbe} ${vraie}`),
            },
            explication:
              `${reserve} ${verbe} ${point}, et ${point} ${verbe} ${vraie} découle du premier ` +
              `temps : la transitivité donne ${reserve} ${verbe} ${vraie}. Les autres énoncés ne ` +
              'se déduisent d’aucun enchaînement.',
          };
        }
      }

      return item;
    }
    return null;
  },
};
