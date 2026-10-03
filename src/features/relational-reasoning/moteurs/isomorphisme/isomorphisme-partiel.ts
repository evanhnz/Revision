/**
 * Moteur « Isomorphisme partiel » — catégorie Isomorphisme.
 *
 * Deux réseaux et un appariement **presque** correct : toutes les paires sont
 * données sauf une, qui est fausse. Il faut dire laquelle.
 *
 * C'est le complément de Réseau relationnel, et l'exercice est d'une autre
 * nature. Construire un appariement se fait en cherchant des invariants —
 * combien d'arêtes sortent de chaque sommet, qui est relié à qui. **Réfuter** un
 * appariement se fait en cherchant un contre-exemple : une paire d'entités dont
 * la relation ne se retrouve pas entre leurs images. C'est une compétence
 * distincte, et plus proche de la vérification d'une preuve que de sa
 * construction.
 *
 * Le point de conception décisif : l'appariement proposé est obtenu en prenant
 * l'appariement **correct** et en échangeant deux images. Ce n'est pas un détail
 * de commodité. Un appariement faux tiré au hasard serait faux en de nombreux
 * points, et n'importe quelle réponse pourrait se justifier ; en n'échangeant
 * que deux images, **exactement deux** entités sont mal appariées, et l'énoncé
 * ne présente qu'une de ces deux paires comme suspecte, l'autre étant maintenue
 * correcte par construction. Le moteur vérifie donc qu'une seule paire de
 * l'appariement affiché viole la structure.
 */
import { matrice, reetiqueter, rigide } from '../../noyaux/isomorphisme';
import { blocMatrice, libelle, texte } from '../../noyaux/presentation';
import type { Alea, Systeme } from '../../systemes/types';
import type { Item, Moteur, Option } from '../types';

const GRECS = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ'];

const TIRAGES = 40;

export const isomorphismePartiel: Moteur = {
  id: 'isomorphisme-partiel',
  nom: 'Isomorphisme partiel',
  categorie: 'isomorphisme',
  resume: 'Un appariement presque juste : une seule paire est fausse, trouvez-la.',
  regimes: ['algebre', 'clos'],

  engendrer(systeme: Systeme, echelon: number, alea: Alea): Item | null {
    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(3, Math.min(echelon + 2, 8)), alea);
      const n = instance.entites.length;
      if (n < 4 || n > GRECS.length) continue;
      // La rigidité n'est pas requise pour poser la question, mais elle l'est
      // pour que la réponse soit unique : sans elle, l'appariement « faux »
      // pourrait être un autre isomorphisme, donc correct.
      if (!rigide(systeme, instance)) continue;

      const ordre = alea.melanger(Array.from({ length: n }, (_, i) => i));
      const { instance: copie, correspondance } = reetiqueter(instance, GRECS.slice(0, n), ordre);

      const gauche = matrice(systeme, instance);
      const droite = matrice(systeme, copie);
      const rangDroite = new Map(copie.entites.map((e, i) => [e, i]));

      // On échange les images de deux entités.
      const [x, y] = alea.plusieurs(instance.entites, 2);
      const propose: Record<string, string> = { ...correspondance };
      propose[x] = correspondance[y];
      propose[y] = correspondance[x];

      /**
       * Les entités dont au moins une relation n'est pas conservée par
       * l'appariement proposé. Avec un simple échange, ce sont normalement `x`
       * et `y` — mais pas toujours : si `x` et `y` jouent des rôles très
       * proches, l'échange peut ne rien casser du tout, ou en casser
       * davantage. On vérifie plutôt que de supposer.
       */
      const fautives = instance.entites.filter((a) =>
        instance.entites.some((b) => {
          if (a === b) return false;
          const i = instance.entites.indexOf(a);
          const j = instance.entites.indexOf(b);
          const ia = rangDroite.get(propose[a]);
          const jb = rangDroite.get(propose[b]);
          if (ia === undefined || jb === undefined) return false;
          return gauche[i][j] !== droite[ia][jb];
        }),
      );
      // Un échange qui ne casse rien, ou qui casse plus que la paire échangée,
      // ne donne pas une question à réponse unique.
      if (fautives.length !== 2) continue;

      // Le témoin : la paire dont la relation n'est pas conservée. C'est lui
      // qu'on cite dans l'explication, pour que la correction montre le
      // contre-exemple et non le seul verdict.
      const [f, g] = fautives;
      const relationOrigine = gauche[instance.entites.indexOf(f)][instance.entites.indexOf(g)];
      const ri = rangDroite.get(propose[f]);
      const rj = rangDroite.get(propose[g]);
      if (ri === undefined || rj === undefined) continue;
      const relationImage = droite[ri][rj];

      const melange = alea.melanger(instance.entites);
      const options: Option[] = melange.map((entite) => ({
        texte: `${entite} → ${propose[entite]}`,
      }));
      // Les deux entités fautives sont symétriques dans la faute : on ne peut
      // pas demander « laquelle », il faut demander « quelle paire ». D'où une
      // option unique par entité, mais deux réponses acceptables — ce que le
      // format « multiple » exprime exactement, et que le barème gère déjà.
      const bonnes = melange.flatMap((entite, i) => (fautives.includes(entite) ? [i] : []));

      return {
        moteur: 'isomorphisme-partiel',
        systeme: systeme.id,
        consigne: 'Quelles lignes de cet appariement sont fausses ?',
        enonce: [
          texte(
            'Les deux réseaux ci-dessous ont la même structure. L’appariement proposé est ' +
              'presque correct : **deux entités** ont été échangées. Cochez les deux lignes ' +
              'fautives — il n’y en a pas d’autres.',
          ),
          texte('Premier réseau.'),
          blocMatrice(systeme, instance),
          texte('Second réseau, réétiqueté.'),
          blocMatrice(systeme, copie),
        ],
        reponse: { genre: 'multiple', options, bonnes },
        explication:
          `L’échange porte sur ${f} et ${g}. Le contre-exemple : dans le premier réseau, ` +
          `${f} ${libelle(systeme, relationOrigine)} ${g}` +
          `, alors que leurs images proposées, ${propose[f]} et ${propose[g]}, sont dans la ` +
          `relation « ${libelle(systeme, relationImage)} ». Toutes les autres lignes sont ` +
          'correctes : c’est ce qui rend la faute localisable au lieu d’être diffuse.',
      };
    }
    return null;
  },
};
