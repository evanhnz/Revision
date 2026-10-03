/**
 * Mise en forme d'une instance : phrases françaises et blocs d'affichage.
 *
 * Aucun moteur ne fabrique lui-même ses phrases : elles sortent toutes d'ici,
 * pour qu'un système qui change de vocabulaire n'oblige pas à retoucher trente
 * générateurs.
 */
import type { Bloc } from '../moteurs/types';
import type { Fait, Instance, Systeme } from '../systemes/types';

/** « A est à l'est de B ». */
export function phrase(systeme: Systeme, fait: Fait): string {
  const relation = systeme.relations.find((r) => r.id === fait.relation);
  return `${fait.sujet} ${relation?.libelle ?? fait.relation} ${fait.objet}.`;
}

export function phrases(systeme: Systeme, faits: readonly Fait[]): string[] {
  return faits.map((fait) => phrase(systeme, fait));
}

/** Le libellé d'une relation, ou son identifiant à défaut. */
export function libelle(systeme: Systeme, relation: string): string {
  return systeme.relations.find((r) => r.id === relation)?.libelle ?? relation;
}

/** Le libellé sans le « est » initial : « à l'est de ». */
export function libelleNu(systeme: Systeme, relation: string): string {
  return libelle(systeme, relation).replace(/^(est|occupe) /, '');
}

/** Les faits énoncés, en phrases. */
export function blocFaits(systeme: Systeme, faits: readonly Fait[]): Bloc {
  return { type: 'faits', phrases: phrases(systeme, faits) };
}

/**
 * Le dessin d'un modèle : une grille pour les systèmes-produits à deux axes ou
 * plus, un graphe sinon.
 *
 * Les systèmes à un seul axe passent aussi par la grille : une ligne de cases
 * se lit mieux qu'un graphe en chaîne.
 */
export function blocModele(systeme: Systeme, instance: Instance, souligne?: string[]): Bloc {
  const coordonnees = instance.modele?.coordonnees;
  if (systeme.axes && coordonnees) {
    return {
      type: 'grille',
      axes: systeme.axes,
      points: instance.entites.map((etiquette) => ({
        etiquette,
        coord: coordonnees[etiquette] ?? systeme.axes!.map(() => 0),
      })),
      souligne,
    };
  }
  return blocGraphe(systeme, instance);
}

/**
 * Le réseau **complet** d'une instance : toutes les paires, et non les seuls
 * faits énoncés. C'est ce qu'il faut montrer quand l'exercice porte sur la
 * structure entière — apparier deux réseaux, en reconnaître un isomorphe.
 */
export function blocGraphe(systeme: Systeme, instance: Instance, manquante?: { de: string; a: string }): Bloc {
  const aretes: { de: string; a: string; libelle: string; sorte?: 'positif' | 'negatif' }[] = [];
  const modele = instance.modele;
  const vues = new Set<string>();

  for (const a of instance.entites) {
    for (const b of instance.entites) {
      if (a === b) continue;
      // Une relation symétrique ne se trace qu'une fois.
      const relation = modele
        ? systeme.relationDansModele(modele, a, b)
        : instance.faits.find((f) => f.sujet === a && f.objet === b)?.relation;
      if (!relation) continue;
      const symetrique = systeme.converse(relation) === relation;
      const clef = symetrique ? [a, b].sort().join('|') : `${a}|${b}`;
      if (vues.has(clef)) continue;
      vues.add(clef);
      const meta = systeme.relations.find((r) => r.id === relation);
      aretes.push({
        de: a,
        a: b,
        libelle: meta?.bref ?? relation,
        sorte: meta?.algebre === 'opposition' ? 'negatif' : 'positif',
      });
    }
  }

  return { type: 'graphe', noeuds: instance.entites, aretes, manquante };
}

/**
 * La matrice complète des relations : une ligne et une colonne par entité.
 *
 * C'est la présentation qui convient aux structures denses — un ordre total sur
 * cinq entités compte dix arêtes, illisibles en graphe — et celle qui cache le
 * mieux la disposition, puisqu'elle n'en a aucune. Relational Web s'en sert pour
 * cette raison : le cahier des charges demande que la position des nœuds ne
 * donne aucun indice.
 */
export function blocMatrice(systeme: Systeme, instance: Instance): Bloc {
  const modele = instance.modele;
  const bref = (relation: string) =>
    systeme.relations.find((r) => r.id === relation)?.bref ?? relation;

  return {
    type: 'tableau',
    entetes: ['', ...instance.entites],
    lignes: instance.entites.map((a) => [
      a,
      ...instance.entites.map((b) => {
        if (a === b) return '·';
        const relation = modele
          ? systeme.relationDansModele(modele, a, b)
          : instance.faits.find((f) => f.sujet === a && f.objet === b)?.relation;
        return relation ? bref(relation) : '?';
      }),
    ]),
  };
}

/** Un bloc de texte, pour les consignes intercalées. */
export function texte(contenu: string): Bloc {
  return { type: 'texte', texte: contenu };
}
