/**
 * Moteur « Cadres de référence » — catégorie Autres algèbres.
 *
 * Une entité observe, tournée dans une direction donnée. Où se trouve une autre
 * entité **de son point de vue** : devant, derrière, à sa gauche, à sa droite ?
 *
 * C'est le seul moteur du catalogue qui demande de changer de **cadre de
 * référence**, et c'est une difficulté d'une autre nature que la composition.
 * Toutes les relations des systèmes-produits sont **allocentriques** : « au nord
 * de » ne dépend de personne. La question posée ici est **égocentrique** : la
 * même position absolue devient « devant » ou « derrière » selon l'orientation de
 * l'observateur. Il faut donc appliquer une rotation, et l'erreur caractéristique
 * consiste à confondre la gauche de l'observateur avec la sienne — erreur que
 * l'on fait en donnant une direction à quelqu'un qui vient vers nous.
 *
 * **Le calcul.** L'observateur regarde dans une direction ; on en déduit un
 * vecteur « devant » et un vecteur « droite », obtenu du premier par un quart de
 * tour dans le sens horaire. Le déplacement de l'observateur vers la cible se
 * projette sur ces deux vecteurs : le signe de chaque composante donne
 * devant/derrière et droite/gauche, et la composante nulle donne l'alignement.
 *
 * Seuls les **deux premiers axes** sont utilisés, même dans un volume : un cadre
 * égocentrique à trois dimensions demanderait aussi une inclinaison, et l'énoncé
 * deviendrait illisible pour un gain nul.
 */
import { blocModele, texte } from '../../noyaux/presentation';
import type { AxeProduit } from '../../systemes/axes';
import type { Alea, Systeme } from '../../systemes/types';
import type { Item, Moteur, Option } from '../types';

const TIRAGES = 40;

/** Les quatre orientations, avec leur vecteur « devant » et leur vecteur « droite ». */
interface Orientation {
  /** Nommée par l'axe et le sens vers lequel l'observateur regarde. */
  axe: number;
  sens: 1 | -1;
  devant: [number, number];
  droite: [number, number];
}

/**
 * Le vecteur « droite » est le vecteur « devant » tourné d'un quart de tour dans
 * le sens horaire : (dx, dy) → (dy, −dx). C'est la convention du plan orienté où
 * le second axe croît vers le haut, et c'est elle qui décide de tout le reste.
 */
function orientation(axe: number, sens: 1 | -1): Orientation {
  const devant: [number, number] = axe === 0 ? [sens, 0] : [0, sens];
  const droite: [number, number] = [devant[1], -devant[0]];
  return { axe, sens, devant, droite };
}

function nommerOrientation(axes: AxeProduit[], o: Orientation): string {
  const axe = axes[o.axe];
  const libelle = o.sens === 1 ? axe.versLeHaut : axe.versLeBas;
  // « est au nord de » → « vers le nord ». On retire la forme verbale pour
  // obtenir une direction, et non une relation.
  return libelle.replace(/^est (au |à l'|à la |aux |en )?/u, '');
}

export const cadres: Moteur = {
  id: 'cadres',
  nom: 'Cadres de référence',
  categorie: 'algebres',
  resume: 'Où se trouve une entité du point de vue d’une autre, selon l’orientation de celle-ci ?',
  regimes: ['algebre', 'transformation'],
  // Il faut un plan : deux axes non circulaires au moins.
  compatible: (systeme: Systeme) => (systeme.axes?.length ?? 0) >= 2,

  engendrer(systeme: Systeme, echelon: number, alea: Alea): Item | null {
    const axes = (systeme.axes ?? []) as AxeProduit[];
    if (axes.length < 2) return null;

    for (let essai = 0; essai < TIRAGES; essai += 1) {
      const instance = systeme.engendrer(Math.max(2, Math.min(echelon, 7)), alea);
      const coordonnees = instance.modele?.coordonnees;
      if (!coordonnees) continue;

      const [observateur, cible] = alea.plusieurs(instance.entites, 2);
      const po = coordonnees[observateur];
      const pc = coordonnees[cible];
      if (!po || !pc) continue;

      const o = orientation(alea.entier(2), alea.reel() < 0.5 ? 1 : -1);
      const d: [number, number] = [pc[0] - po[0], pc[1] - po[1]];
      const avant = d[0] * o.devant[0] + d[1] * o.devant[1];
      const cote = d[0] * o.droite[0] + d[1] * o.droite[1];

      // Deux entités confondues sur les deux premiers axes n'ont pas de
      // position relative dans le plan : on rejette.
      if (avant === 0 && cote === 0) continue;

      const morceaux: string[] = [];
      if (avant > 0) morceaux.push('devant');
      else if (avant < 0) morceaux.push('derrière');
      if (cote > 0) morceaux.push('à sa droite');
      else if (cote < 0) morceaux.push('à sa gauche');
      const juste = morceaux.join(' et ');

      // Les huit réponses possibles du cadre égocentrique, moins la bonne.
      const toutes = [
        'devant',
        'derrière',
        'à sa droite',
        'à sa gauche',
        'devant et à sa droite',
        'devant et à sa gauche',
        'derrière et à sa droite',
        'derrière et à sa gauche',
      ];
      const autres = toutes.filter((n) => n !== juste);

      // Le leurre le plus instructif est systématiquement proposé : celui
      // obtenu en inversant la gauche et la droite, c'est-à-dire en prenant le
      // point de vue de l'observateur pour le sien.
      const inverse = juste.replace('à sa droite', '§').replace('à sa gauche', 'à sa droite').replace('§', 'à sa gauche');
      const obligatoire = inverse !== juste && autres.includes(inverse) ? [inverse] : [];
      const complement = alea.plusieurs(
        autres.filter((n) => !obligatoire.includes(n)),
        3 - obligatoire.length,
      );

      const melange = alea.melanger([juste, ...obligatoire, ...complement]);
      const options: Option[] = melange.map((n) => ({ texte: `${cible} est ${n}` }));
      const bonne = melange.indexOf(juste);
      if (bonne < 0) continue;

      const direction = nommerOrientation(axes, o);

      return {
        moteur: 'cadres',
        systeme: systeme.id,
        consigne: `${observateur} regarde ${direction}. De son point de vue, où est ${cible} ?`,
        enonce: [
          texte(
            `${systeme.resume} Attention : la question ne porte pas sur les directions absolues ` +
              `mais sur le point de vue de ${observateur}. « Sa droite » est la droite de ` +
              `${observateur}, qui regarde ${direction} — et non la vôtre.`,
          ),
          blocModele(systeme, instance, [observateur, cible]),
        ],
        reponse: { genre: 'unique', options, bonne },
        explication:
          `${observateur} regarde ${direction}. Son « devant » pointe donc dans cette direction, ` +
          'et sa « droite » s’obtient en tournant d’un quart de tour vers la droite. Le ' +
          `déplacement de ${observateur} vers ${cible} a une composante ` +
          `${avant === 0 ? 'nulle' : avant > 0 ? 'positive' : 'négative'} vers l’avant et une ` +
          `composante ${cote === 0 ? 'nulle' : cote > 0 ? 'positive' : 'négative'} vers la ` +
          `droite : ${cible} est donc ${juste}. ` +
          (inverse !== juste
            ? `L’erreur à éviter est de répondre « ${inverse} », ce qui revient à prendre votre ` +
              `propre droite pour celle de ${observateur}.`
            : 'Ici l’alignement supprime l’ambiguïté gauche-droite.'),
      };
    }
    return null;
  },
};
