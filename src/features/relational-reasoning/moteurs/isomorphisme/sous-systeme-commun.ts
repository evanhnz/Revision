/**
 * Moteur « Sous-système commun » — catégorie Isomorphisme.
 *
 * Deux réseaux sont montrés, tirés de **systèmes différents** ou du même système
 * mais réétiquetés. La question : quel est le plus grand motif que les deux
 * partagent ?
 *
 * Le choix qui rend l'exercice possible est le suivant : **on ne demande pas de
 * construire le motif, mais de reconnaître sa taille**. Demander de le dessiner
 * exigerait une interface de saisie de graphe ; demander « lequel de ces quatre
 * motifs est commun aux deux » retomberait sur Recherche de motif. Demander la
 * **taille du plus grand commun** est la question qui porte réellement sur la
 * comparaison des deux structures, et elle se corrige par un entier.
 *
 * Le calcul est une énumération : pour k décroissant, on cherche une
 * sous-structure de taille k du premier réseau qui apparaisse dans le second. La
 * lecture est **non induite** ici, à la différence de Recherche de motif : ce
 * qu'on partage, ce sont des relations présentes, et exiger que les absences
 * concordent aussi rendrait la réponse presque toujours égale à deux. Les
 * réseaux comptent au plus sept entités, soit trente-cinq sous-ensembles de
 * taille trois — l'énumération est immédiate.
 */
import { matrice, occurrences, sousMatrice } from '../../noyaux/isomorphisme';
import { blocMatrice, texte } from '../../noyaux/presentation';
import type { Matrice } from '../../noyaux/isomorphisme';
import type { Alea, Systeme } from '../../systemes/types';
import type { Item, Moteur, Option } from '../types';

const TIRAGES = 40;

/** Tous les sous-ensembles d'indices de taille `k`. */
function combinaisons(n: number, k: number): number[][] {
  const resultat: number[][] = [];
  const courant: number[] = [];
  const parcourir = (depart: number): void => {
    if (courant.length === k) {
      resultat.push([...courant]);
      return;
    }
    for (let i = depart; i < n; i += 1) {
      courant.push(i);
      parcourir(i + 1);
      courant.pop();
    }
  };
  parcourir(0);
  return resultat;
}

/**
 * La taille du plus grand motif commun, et un témoin.
 *
 * Le motif doit compter au moins une arête par sommet au-delà du premier, sans
 * quoi un ensemble de sommets sans aucune relation compterait comme « commun » —
 * ce qui est formellement vrai et pédagogiquement vide.
 */
function plusGrandCommun(
  gauche: Matrice,
  droite: Matrice,
  maximum: number,
): { taille: number; indices: number[] } | null {
  for (let k = Math.min(maximum, gauche.length, droite.length); k >= 2; k -= 1) {
    for (const indices of combinaisons(gauche.length, k)) {
      const motif = sousMatrice(gauche, indices);
      const aretes = motif.flat().filter(Boolean).length;
      if (aretes < k - 1) continue;
      if (occurrences(motif, droite, false).length) return { taille: k, indices };
    }
  }
  return null;
}

export const sousSystemeCommun: Moteur = {
  id: 'sous-systeme-commun',
  nom: 'Sous-système commun',
  categorie: 'isomorphisme',
  resume: 'Deux réseaux : quelle est la taille du plus grand motif qu’ils partagent ?',
  regimes: ['algebre', 'clos'],

  engendrer(systeme: Systeme, echelon: number, alea: Alea): Item | null {
    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const premier = systeme.engendrer(Math.max(3, Math.min(echelon + 2, 8)), alea);
      const second = systeme.engendrer(Math.max(3, Math.min(echelon + 2, 8)), alea);
      if (premier.entites.length < 4 || second.entites.length < 4) continue;

      const gauche = matrice(systeme, premier);
      const droite = matrice(systeme, second);

      const commun = plusGrandCommun(gauche, droite, 5);
      if (!commun) continue;

      // Une réponse égale au minimum ou au maximum possible se devinerait sans
      // examen : on ne retient que les valeurs intermédiaires.
      const plafond = Math.min(premier.entites.length, second.entites.length);
      if (commun.taille < 3 || commun.taille >= plafond) continue;

      const proposees = [commun.taille - 1, commun.taille, commun.taille + 1, commun.taille + 2]
        .filter((n) => n >= 2 && n <= plafond);
      if (proposees.length < 3) continue;

      const melange = alea.melanger(proposees);
      const options: Option[] = melange.map((n) => ({ texte: `${n} entités` }));
      const bonne = melange.indexOf(commun.taille);

      return {
        moteur: 'sous-systeme-commun',
        systeme: systeme.id,
        consigne: 'Combien d’entités compte le plus grand motif commun aux deux réseaux ?',
        enonce: [
          texte(
            'Deux réseaux indépendants. Un motif est « commun » lorsqu’on peut choisir le ' +
              'même nombre d’entités dans chacun, de telle sorte que les relations du premier ' +
              'groupe se retrouvent toutes dans le second — les noms n’ayant aucune importance.',
          ),
          texte('Premier réseau.'),
          blocMatrice(systeme, premier),
          texte('Second réseau.'),
          blocMatrice(systeme, second),
        ],
        reponse: { genre: 'unique', options, bonne },
        explication:
          `Le plus grand motif commun compte ${commun.taille} entités : dans le premier réseau, ` +
          `${commun.indices.map((i) => premier.entites[i]).join(', ')} forment une structure qui ` +
          'se retrouve dans le second. Aucun groupe plus grand n’y parvient — l’énumération des ' +
          'sous-ensembles de taille supérieure ne donne aucune correspondance.',
      };
    }
    return null;
  },
};
