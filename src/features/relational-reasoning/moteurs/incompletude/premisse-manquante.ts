/**
 * Moteur « Prémisse manquante » — catégorie Information incomplète.
 *
 * Des faits sont donnés, et une conclusion qu'ils ne suffisent pas à établir. Il
 * faut choisir le fait qui, ajouté aux autres, la rend certaine.
 *
 * C'est l'exercice réciproque de Prémisses minimales, et il est plus difficile
 * pour une raison précise : il demande de raisonner sur ce qui **n'est pas
 * écrit**. On ne vérifie pas une chaîne existante, on cherche le maillon qui la
 * fermerait.
 *
 * Deux exigences sur les leurres.
 *
 * **Un leurre doit être compatible avec les prémisses.** Un fait qui rend le
 * réseau incohérent entraînerait formellement n'importe quelle conclusion — dont
 * celle demandée —, et serait donc une réponse correcte pour la mauvaise raison.
 * Le noyau écarte ces candidats avant de tester l'entraînement.
 *
 * **Un seul candidat doit suffire.** Si deux faits proposés closent chacun la
 * chaîne, l'exercice a deux réponses. Le moteur calcule la liste complète des
 * candidats suffisants et rejette le tirage si elle n'en compte pas exactement
 * un — contrainte vérifiée sur l'instance produite, non supposée du procédé.
 */
import { coherent, possibilites } from '../../noyaux/algebre';
import { candidatsSuffisants, FAITS_MAXIMUM } from '../../noyaux/mus';
import { blocFaits, libelle, phrase, texte } from '../../noyaux/presentation';
import type { Alea, Fait, Systeme } from '../../systemes/types';
import type { Item, Moteur, Option } from '../types';

const TIRAGES = 60;
const CANDIDATS = 4;

export const premisseManquante: Moteur = {
  id: 'premisse-manquante',
  nom: 'Prémisse manquante',
  categorie: 'incompletude',
  resume: 'La conclusion ne suit pas encore : quel fait ajouté la rendrait certaine ?',
  regimes: ['algebre'],
  compatible: (systeme: Systeme) => Boolean(systeme.composer) && systeme.relations.length >= 2,

  engendrer(systeme: Systeme, echelon: number, alea: Alea): Item | null {
    if (!systeme.composer) return null;
    const algebre = {
      relations: systeme.relations.map((r) => r.id),
      converse: systeme.converse,
      composer: systeme.composer,
    };

    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(3, Math.min(echelon + 1, 7)), alea);
      if (!instance.modele || instance.faits.length > FAITS_MAXIMUM - 1) continue;
      const contexte = { algebre, cheminComplet: systeme.cheminComplet, entites: instance.entites };

      const [a, b] = alea.plusieurs(instance.entites, 2);
      const conclusion = systeme.relationDansModele(instance.modele, a, b);

      // On retire un fait de l'instance : c'est le trou à combler. Puis on
      // vérifie que la conclusion est bien devenue incertaine — sinon le fait
      // retiré n'était pas nécessaire et il n'y a pas de question.
      const retire = alea.un(instance.faits);
      const premisses = instance.faits.filter((f) => f !== retire);
      if (premisses.length < 2) continue;
      if (!coherent(algebre, systeme.cheminComplet, instance.entites, premisses)) continue;

      const ouvertes = possibilites(
        algebre,
        systeme.cheminComplet,
        instance.entites,
        premisses,
        a,
        b,
      );
      if (ouvertes.size < 2 || !ouvertes.has(conclusion)) continue;

      // Les candidats : le fait retiré, et des variantes portant sur d'autres
      // paires ou d'autres relations. Ils doivent tous être *plausibles* — même
      // paire, relation différente, ou paire voisine.
      const proposes: Fait[] = [retire];
      const autresRelations = systeme.relations.filter((r) => r.id !== retire.relation);
      for (const relation of alea.melanger(autresRelations).slice(0, 2)) {
        proposes.push({ sujet: retire.sujet, relation: relation.id, objet: retire.objet });
      }
      const [x, y] = alea.plusieurs(instance.entites, 2);
      if (x !== retire.sujet || y !== retire.objet) {
        proposes.push({ sujet: x, relation: alea.un(systeme.relations).id, objet: y });
      }
      if (proposes.length < CANDIDATS) continue;

      const suffisants = candidatsSuffisants(contexte, premisses, proposes, a, b, conclusion);
      // Exactement un candidat doit clore la chaîne.
      if (suffisants.length !== 1) continue;

      const melange = alea.melanger(proposes.slice(0, CANDIDATS));
      const bonne = melange.indexOf(suffisants[0]);
      if (bonne < 0) continue;
      const options: Option[] = melange.map((fait) => ({ texte: phrase(systeme, fait) }));

      return {
        moteur: 'premisse-manquante',
        systeme: systeme.id,
        consigne: `Quel fait ajouté rendrait certain que ${a} ${libelle(systeme, conclusion)} ${b} ?`,
        enonce: [
          texte(
            `${systeme.resume} Avec les seuls faits ci-dessous, ${a} et ${b} peuvent encore être ` +
              `dans ${ouvertes.size} relations différentes : la conclusion n’est pas acquise. ` +
              'Un seul des faits proposés ferme la chaîne.',
          ),
          blocFaits(systeme, premisses),
        ],
        reponse: { genre: 'unique', options, bonne },
        explication:
          `Avec « ${phrase(systeme, suffisants[0])} », la composition ne laisse plus qu’une ` +
          `relation possible entre ${a} et ${b} : « ${libelle(systeme, conclusion)} ». Les ` +
          'autres propositions sont compatibles avec les prémisses — elles ne sont pas ' +
          'absurdes — mais elles laissent la paire indéterminée : ajouter un fait vrai ne suffit ' +
          'pas, il faut ajouter **celui qui manque au chemin**.',
      };
    }
    return null;
  },
};
