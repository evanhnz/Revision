/**
 * Les étiquettes qui désignent un contenu écarté par défaut.
 *
 * Module volontairement sans aucun import : l'estimation de niveau s'en sert,
 * et elle ne doit pas traîner derrière elle la couche de contenu chiffré — ni,
 * par ricochet, l'environnement Astro qui la fait vivre. Les suites d'essais
 * qui n'éprouvent que les formules ont ainsi de quoi tourner sous Node nu.
 */

/**
 * Matière de la résolution de cas pratique.
 *
 * Nommée ici parce que plusieurs modules ont besoin de la reconnaître, et qu'un
 * littéral recopié trois fois est un littéral qui finira par diverger.
 */
export const MATIERE_CAS_PRATIQUE = 'Cas pratique';

/**
 * Une fiche de méthode, de devoir ou de corrigé.
 *
 * Ces fiches enseignent **comment traiter une épreuve**, pas ce qu'il faut en
 * savoir. Les réviser en répétition espacée ou les compter dans une estimation
 * de niveau reviendrait à mesurer la connaissance d'un mode d'emploi. Elles
 * restent naturellement lisibles, et le réglage permet de les réintégrer.
 *
 * Le repérage passe par ce tag, que le build impose à toute fiche dont le titre
 * annonce une méthode, un devoir ou un corrigé.
 */
export const TAG_METHODOLOGIE = 'méthodologie';

export function estMethodologique(fiche: { tags?: string[] }): boolean {
  return (fiche.tags ?? []).includes(TAG_METHODOLOGIE);
}
