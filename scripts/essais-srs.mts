/**
 * Essais de l'ordonnanceur de répétition espacée (FSRS).
 *
 * Ce qui est vérifié ici n'est pas l'algorithme — c'est le travail de
 * `ts-fsrs`, et le refaire à la main serait le recopier — mais **le raccord**
 * entre lui et le site : la correspondance des quatre notes, la cohérence entre
 * l'échéance du modèle et la date au jour dont dépendent l'index et les écrans,
 * et la survie de l'état à un aller-retour par la sauvegarde JSON.
 *
 * C'est exactement là que le passage de SM-2 à FSRS pouvait casser sans bruit :
 * une carte dont `du` ne suit plus `fsrs.due` disparaît de la file sans que rien
 * ne le signale.
 */
import {
  NOTES,
  apercu,
  carteNeuve,
  delai,
  estDue,
  maitrise,
  noter,
} from '../src/lib/srs';
import { jourISO, type EtatCarte, type Note } from '../src/lib/db';

let echecs = 0;
function verifier(titre: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${titre}`);
  if (!ok) console.log(`      obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);
}

const LE_1ER = new Date('2026-03-01T09:00:00Z');
const neuve = () => carteNeuve('c1', 'fiche-1', 'Droit public', LE_1ER);

console.log('\nCARTE NEUVE');
{
  const carte = neuve();
  verifier('due le jour même', carte.du, jourISO(LE_1ER));
  verifier('aucune révision', [carte.revisions, carte.oublis, carte.intervalle], [0, 0, 0]);
  verifier('état FSRS « nouveau »', carte.fsrs.state, 0);
  verifier('elle est exigible', estDue(carte, jourISO(LE_1ER)), true);
  verifier('maîtrise nulle', maitrise(carte), 0);
}

console.log('\nLES QUATRE NOTES — l’ordre des échéances est celui des boutons');
{
  // Une carte déjà installée, pour que les quatre notes se distinguent : sur une
  // carte neuve, plusieurs boutons peuvent tomber sur le même jour.
  let carte = neuve();
  let jour = LE_1ER;
  for (let i = 0; i < 3; i += 1) {
    carte = noter(carte, 'correct', jour);
    jour = new Date(`${carte.du}T09:00:00Z`);
  }
  const echeances = apercu(carte, jour);
  const jours = NOTES.map((note) => echeances[note].getTime());
  verifier(
    'oublié ≤ difficile ≤ correct ≤ facile',
    jours.every((t, i) => i === 0 || jours[i - 1] <= t),
    true,
  );
  verifier('« oublié » ramène la carte avant « facile »', jours[0] < jours[3], true);
}

console.log('\nNOTATION — ce que le site lit doit suivre ce que le modèle décide');
{
  let carte = neuve();
  let jour = LE_1ER;
  const intervalles: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    carte = noter(carte, 'correct', jour);
    verifier(`révision ${i + 1} : « du » suit l’échéance FSRS`, carte.du, jourISO(new Date(carte.fsrs.due)));
    intervalles.push(carte.intervalle);
    jour = new Date(`${carte.du}T09:00:00Z`);
  }
  verifier('les intervalles croissent', intervalles.every((v, i) => i === 0 || v >= intervalles[i - 1]), true);
  verifier('six révisions comptées', carte.revisions, 6);
  verifier('aucun oubli', carte.oublis, 0);
  verifier('carte acquise', maitrise(carte) > 0.5, true);
  verifier(
    'pas de reprise le jour même (enable_short_term désactivé)',
    carte.du > jourISO(jour) || carte.intervalle >= 1,
    true,
  );
}

console.log('\nOUBLI — il compte, et il raccourcit');
{
  let carte = neuve();
  let jour = LE_1ER;
  for (let i = 0; i < 4; i += 1) {
    carte = noter(carte, 'facile', jour);
    jour = new Date(`${carte.du}T09:00:00Z`);
  }
  const avant = carte.intervalle;
  const apres = noter(carte, 'oublie', jour);
  verifier('l’intervalle se raccourcit', apres.intervalle < avant, true);
  verifier('l’oubli est compté', apres.oublis, 1);
  verifier('les révisions aussi', apres.revisions, 5);
  // Notre compteur d'oublis est le nôtre : celui de la bibliothèque repart de
  // zéro à la migration, le nôtre est de l'histoire.
  const encore = noter({ ...apres, oublis: 7 }, 'correct', jour);
  verifier('une réussite ne défait pas le compte', encore.oublis, 7);
}

console.log('\nSAUVEGARDE — l’état doit survivre à un aller-retour JSON');
{
  let carte = neuve();
  carte = noter(carte, 'correct', LE_1ER);
  const relu = JSON.parse(JSON.stringify(carte)) as EtatCarte;
  verifier('même forme après aller-retour', relu, carte);
  const suite = noter(relu, 'correct', new Date(`${relu.du}T09:00:00Z`));
  verifier('et l’ordonnanceur la reprend', Number.isFinite(suite.intervalle) && suite.intervalle > 0, true);
  verifier('les dates restent des chaînes', typeof suite.fsrs.due, 'string');
}

console.log('\nLIBELLÉS DE DÉLAI');
{
  const le1er = new Date('2026-03-01T09:00:00Z');
  const dans = (jours: number) => delai(new Date(le1er.getTime() + jours * 86_400_000), le1er);
  verifier('aujourd’hui', dans(0), "aujourd'hui");
  verifier('demain', dans(1), 'demain');
  verifier('dans 9 j', dans(9), 'dans 9 j');
  verifier('dans 2 mois', dans(60), 'dans 2 mois');
  verifier('dans 1 an', dans(400), 'dans 1 an');
  verifier('dans 3 ans', dans(1100), 'dans 3 ans');
}

console.log('\nTOUTES LES NOTES SONT ACCEPTÉES');
{
  for (const note of NOTES as readonly Note[]) {
    const apres = noter(neuve(), note, LE_1ER);
    verifier(`« ${note} » produit une échéance valide`, /^\d{4}-\d{2}-\d{2}$/.test(apres.du), true);
  }
}

console.log(`\n${echecs ? `\x1b[31m✖ ${echecs} échec(s)\x1b[0m` : '\x1b[32m✓ tout passe\x1b[0m'}\n`);
process.exit(echecs ? 1 : 0);
