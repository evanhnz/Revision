/**
 * Contrôle du socle de Veridical Mapping.
 *
 *   npm run essais:veridical
 *
 * Le contrôle décisif est celui de l'escalier. Une procédure adaptative se
 * vérifie mal à la lecture : on la vérifie en la faisant tourner contre un
 * **observateur simulé** dont le seuil est connu d'avance, et en regardant si
 * elle le retrouve. C'est le seul moyen de distinguer un escalier juste d'un
 * escalier qui converge sur autre chose que ce qu'on croit.
 */
import {
  DIMENSIONS,
  PAS,
  borner,
  dimensionsDeFamille,
  ecartEnPas,
  dimensionParId,
} from '../src/features/veridical-mapping/dimensions';
import { aretesDeFamille, arbreCouvrant, idArete, pairesDeFamille } from '../src/features/veridical-mapping/hub';
import {
  REGLAGES,
  escalierNeuf,
  repondre,
  seuil,
  statut,
  type EtatEscalier,
} from '../src/features/veridical-mapping/escalier';
import {
  REGLAGES_PAR_DEFAUT,
  tirerEssai,
  vivierDAretes,
} from '../src/features/veridical-mapping/session';

let echecs = 0;
function verifier(titre: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${titre}${ok ? '' : `\n      obtenu ${JSON.stringify(obtenu)} · attendu ${JSON.stringify(attendu)}`}`);
}

console.log('\nDIMENSIONS — plages et régularité des pas');
verifier('sept dimensions', DIMENSIONS.length, 7);
verifier('quatre prothétiques', dimensionsDeFamille('prothetique').length, 4);
verifier('trois métathétiques', dimensionsDeFamille('metathetique').length, 3);
for (const dimension of DIMENSIONS) {
  const bas = dimension.valeur(0);
  const haut = dimension.valeur(PAS - 1);
  const croissante = Array.from({ length: PAS - 1 }, (_, i) => dimension.valeur(i + 1) > dimension.valeur(i)).every(Boolean);
  verifier(`${dimension.id} : strictement croissante`, croissante, true);
  verifier(`${dimension.id} : plage non dégénérée`, haut > bas * 1.0001 || haut - bas > 1, true);
}

console.log('\nREBOUCLAGE — seule la teinte est circulaire');
const teinte = dimensionParId('teinte')!;
const taille = dimensionParId('taille')!;
verifier('teinte : 2 et 118 sont voisins', ecartEnPas(teinte, 2, 118), 4);
verifier('taille : 2 et 118 sont distants', ecartEnPas(taille, 2, 118), 116);
verifier('teinte : le pas 125 reboucle sur 5', borner(teinte, 125), 5);
verifier('taille : le pas 125 est borné', borner(taille, 125), PAS - 1);
verifier('taille : le pas -3 est borné', borner(taille, -3), 0);

console.log('\nHUB — arêtes orientées et arbre couvrant');
verifier('prothétique : 12 arêtes orientées', aretesDeFamille('prothetique').length, 12);
verifier('métathétique : 6 arêtes orientées', aretesDeFamille('metathetique').length, 6);
verifier('prothétique : 6 paires', pairesDeFamille('prothetique').length, 6);
verifier('arbre prothétique : 3 paires', arbreCouvrant('prothetique', () => 0).length, 3);
verifier('arbre métathétique : 2 paires', arbreCouvrant('metathetique', () => 0).length, 2);
{
  const arbre = arbreCouvrant('prothetique', () => 0);
  const touchees = new Set(arbre.flatMap((paire) => [paire.a.id, paire.b.id]));
  verifier('l’arbre touche les quatre dimensions', touchees.size, 4);
}
{
  // L'arbre doit préférer les paires les moins travaillées.
  const cher = idArete('taille', 'luminosite');
  const arbre = arbreCouvrant('prothetique', (a, b) =>
    idArete(a, b) === cher || idArete(b, a) === cher ? 1000 : 0,
  );
  const contient = arbre.some(
    (p) => (p.a.id === 'taille' && p.b.id === 'luminosite') || (p.a.id === 'luminosite' && p.b.id === 'taille'),
  );
  verifier('la paire la plus travaillée est évitée', contient, false);
}
{
  const transmodales = aretesDeFamille('prothetique').filter((a) => a.transmodale).length;
  verifier('prothétique : 8 arêtes transmodales', transmodales, 8);
}

console.log('\nESCALIER — mécanique');
{
  let etat = escalierNeuf();
  verifier('écart de départ', etat.delta, REGLAGES.departDelta);
  etat = repondre(etat, true);
  verifier('une seule bonne réponse ne resserre pas', etat.delta, REGLAGES.departDelta);
  etat = repondre(etat, true);
  verifier('deux bonnes de suite resserrent', etat.delta < REGLAGES.departDelta, true);
  const apres = etat.delta;
  etat = repondre(etat, false);
  verifier('une erreur élargit', etat.delta > apres, true);
  verifier('une inversion relevée', etat.inversions.length, 1);
  verifier('pas de seuil avant huit inversions', seuil(etat), null);
  verifier('statut en cours', statut(etat), 'en-cours');
  verifier('statut initial', statut(escalierNeuf()), 'jamais');
}

console.log('\nESCALIER — retrouve-t-il un seuil connu ?');
/**
 * Observateur simulé en choix forcé à deux alternatives : il répond au hasard
 * quand l'écart est nul, et sûrement quand il est large. La fonction
 * psychométrique est une Weibull de paramètre de pente 3, valeur usuelle.
 */
function observateur(delta: number, seuilVrai: number, hasard: () => number): boolean {
  const p = 1 - 0.5 * Math.exp(-((delta / seuilVrai) ** 3));
  return hasard() < p;
}

function generateur(graine: number) {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (const seuilVrai of [3, 8, 20]) {
  const estimations: number[] = [];
  let convergences = 0;
  for (let graine = 1; graine <= 60; graine += 1) {
    const hasard = generateur(graine * 7919 + seuilVrai);
    let etat: EtatEscalier = escalierNeuf();
    for (let essai = 0; essai < 160; essai += 1) {
      etat = repondre(etat, observateur(etat.delta, seuilVrai, hasard));
    }
    const estime = seuil(etat);
    if (estime !== null) estimations.push(estime);
    if (statut(etat) === 'converge') convergences += 1;
  }
  const moyenne = estimations.reduce((t, v) => t + v, 0) / Math.max(1, estimations.length);
  const biais = moyenne / seuilVrai;
  console.log(
    `  seuil vrai ${seuilVrai} pas → estimé ${moyenne.toFixed(2)} ` +
      `(rapport ${biais.toFixed(2)}), ${estimations.length}/60 estimés, ${convergences}/60 stabilisés`,
  );
  // La règle 2-down-1-up converge vers le point à 70,7 % de la courbe. Pour une
  // Weibull de pente 3, ce point vaut (−ln(2 × 0,293))^(1/3) ≈ 0,811 fois le
  // paramètre d'échelle. L'escalier ne doit donc PAS retrouver le paramètre
  // lui-même : c'est ce rapport-là qu'on vérifie, et l'écart à ce rapport
  // trahirait une erreur de règle qu'un intervalle large laisserait passer.
  const attendu = Math.cbrt(-Math.log(2 * 0.293));
  verifier(
    `seuil ${seuilVrai} : rapport conforme au point de convergence (${attendu.toFixed(3)})`,
    Math.abs(biais - attendu) < 0.1,
    true,
  );
  verifier(`seuil ${seuilVrai} : au moins 55 estimations sur 60`, estimations.length >= 55, true);
}

console.log('\nTÂCHES « PLAN » ET « MODULAIRE » — ce qui les rend mesurables');

{
  const hasard = { reel: () => Math.random(), entier: (b: number) => Math.floor(Math.random() * b) };
  const aretes = vivierDAretes({ ...REGLAGES_PAR_DEFAUT, mode: 'exhaustif' }, () => 0);

  // 1. Tâche « plan » : le niveau du hasard doit rester à 50 %, donc **deux**
  //    candidats et un seul juste. C'est la condition de comparabilité des
  //    seuils : ajouter un candidat déplacerait le point de convergence de
  //    l'escalier et rendrait les seuils incomparables d'une tâche à l'autre.
  let plans = 0;
  let deuxCandidats = true;
  let unSeulJuste = true;
  let unSeulAxeFautif = true;
  let coupleReel = true;
  for (let i = 0; i < 400; i += 1) {
    const arete = aretes[i % aretes.length];
    const essai = tirerEssai(arete, 8, { ...REGLAGES_PAR_DEFAUT, mode: 'exhaustif', tache: 'plan' }, hasard);
    if (essai.tache !== 'plan') continue;
    plans += 1;
    for (const sous of essai.sousEssais) {
      if (sous.candidats.length !== 2) deuxCandidats = false;
      if (sous.candidats.filter((c) => c.juste).length !== 1) unSeulJuste = false;
      // Le leurre ne doit différer du juste que sur **un** attribut : c'est ce
      // qui oblige à tenir les deux axes, sans quoi la tâche se réduirait au
      // meilleur des deux seuils.
      const [a, b] = sous.candidats;
      const attributs = ['taillePx', 'clarte', 'teinte', 'positionPct', 'frequenceHz', 'niveauDb', 'dureeMs'] as const;
      const differents = attributs.filter((cle) => a.stimulus[cle] !== b.stimulus[cle]);
      if (differents.length !== 1) unSeulAxeFautif = false;
      // Et la référence doit bien porter **deux** valeurs : son identifiant de
      // dimension est composé.
      if (!sous.reference.dimension.includes('+')) coupleReel = false;
    }
  }
  verifier('plan : des essais sont produits', plans > 0, true);
  verifier('plan : toujours deux candidats (hasard à 50 %)', deuxCandidats, true);
  verifier('plan : un seul candidat juste', unSeulJuste, true);
  verifier('plan : le leurre ne se trompe que sur un axe', unSeulAxeFautif, true);
  verifier('plan : la référence porte bien un couple', coupleReel, true);

  // 2. Tâche modulaire : le candidat juste reproduit l'intervalle, et le décalage
  //    est arbitraire. Les deux propriétés ensemble sont ce qui en fait une mise
  //    en correspondance de **structure** : si le décalage était constant, la
  //    réponse se lirait sur la position et non sur l'écart.
  // La tâche modulaire n'existe que sur les arêtes **arrivant** sur une
  // dimension circulaire, et la seule qui le soit — la teinte — est
  // métathétique. Le vivier prothétique par défaut n'en contient donc aucune :
  // c'est une contrainte du catalogue de dimensions, pas un défaut du tirage, et
  // l'interface doit ne proposer la tâche que là où elle a un sens.
  const aretesMeta = vivierDAretes(
    { ...REGLAGES_PAR_DEFAUT, famille: 'metathetique', mode: 'exhaustif' },
    () => 0,
  );
  const versTeinte = aretesMeta.filter((a) => a.vers.circulaire);
  verifier('modulaire : aucune arête prothétique n\u2019arrive sur une dimension circulaire',
    aretes.some((a) => a.vers.circulaire), false);
  let modulaires = 0;
  let intervalleJuste = true;
  let leurreFaux = true;
  const decalages = new Set<number>();
  for (let i = 0; i < 400 && versTeinte.length; i += 1) {
    const arete = versTeinte[i % versTeinte.length];
    const essai = tirerEssai(
      arete,
      6,
      { ...REGLAGES_PAR_DEFAUT, famille: 'metathetique', mode: 'exhaustif', tache: 'modulaire' },
      hasard,
    );
    if (essai.tache !== 'modulaire') continue;
    modulaires += 1;
    const sous = essai.sousEssais[0];
    const attendu = essai.intervalle ?? -1;
    for (const candidat of sous.candidats) {
      if (candidat.ancre === undefined) { intervalleJuste = false; continue; }
      decalages.add(candidat.ancre);
      const obtenu = ecartEnPas(arete.vers, candidat.ancre, candidat.pas);
      if (candidat.juste && obtenu !== attendu) intervalleJuste = false;
      if (!candidat.juste && obtenu === attendu) leurreFaux = false;
    }
  }
  verifier('modulaire : des essais sont produits', modulaires > 0, true);
  verifier('modulaire : le candidat juste reproduit l\u2019intervalle', intervalleJuste, true);
  verifier('modulaire : le leurre ne le reproduit pas', leurreFaux, true);
  verifier('modulaire : le décalage est bien arbitraire', decalages.size > 20, true);
}

console.log(`\n${echecs ? `\x1b[31m✖ ${echecs} échec(s)\x1b[0m` : '\x1b[32m✓ tout passe\x1b[0m'}\n`);
process.exit(echecs ? 1 : 0);
