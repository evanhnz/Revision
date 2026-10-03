/**
 * Essais de l'estimation de niveau.
 *
 * Ce qui est éprouvé ici est la **convergence** : une formule d'ajustement qui
 * dérive ne se voit pas à l'usage. Elle ne produit pas d'erreur, pas de page
 * blanche, rien qu'une sélection d'exercices mal calibrée quelques semaines
 * plus tard, sans qu'on puisse relier l'un à l'autre. On simule donc des
 * apprenants de niveau connu et on vérifie que l'estimation les retrouve.
 *
 * Les fonctions testées sont pures et extraites pour cette raison ; le reste du
 * module (persistance, réglages, tableau de bord) passe par IndexedDB et relève
 * des essais en navigateur.
 */
import {
  AMORCES,
  NOTE_INITIALE,
  REUSSITE_VISEE,
  ajusterDifficulte,
  ajusterNiveau,
  chanceDeReussite,
  clefs,
  difficulteVisee,
  utilisable,
} from '../src/lib/niveau';

let echecs = 0;
function verifier(titre: string, obtenu: unknown, attendu: unknown) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs += 1;
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${titre}`);
  if (!ok) console.log(`      obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`);
}

console.log('\nPRÉDICTION');
verifier('à notes égales, une chance sur deux', chanceDeReussite(1200, 1200), 0.5);
verifier(
  '400 points d’avance valent dix contre un',
  Math.round(chanceDeReussite(1600, 1200) * 100),
  91,
);
verifier(
  'l’avantage est symétrique',
  Math.round((chanceDeReussite(1600, 1200) + chanceDeReussite(1200, 1600)) * 1000),
  1000,
);

console.log('\nLA CIBLE EST BIEN CELLE ANNONCÉE');
{
  const niveau = 1340;
  const visee = difficulteVisee(niveau);
  verifier(
    'un item à la difficulté visée se réussit à 70 %',
    Math.round(chanceDeReussite(niveau, visee) * 1000) / 1000,
    REUSSITE_VISEE,
  );
  verifier('la cible est plus facile que le niveau', visee < niveau, true);
}

console.log('\nSENS DES AJUSTEMENTS');
{
  const contre = 1200;
  verifier('réussir fait monter', ajusterNiveau(1200, 0, contre, 1) > 1200, true);
  verifier('échouer fait descendre', ajusterNiveau(1200, 0, contre, 0) < 1200, true);
  verifier(
    'réussir contre plus fort rapporte davantage',
    ajusterNiveau(1200, 0, 1600, 1) > ajusterNiveau(1200, 0, 800, 1),
    true,
  );
  verifier(
    'échouer contre plus faible coûte davantage',
    ajusterNiveau(1200, 0, 800, 0) < ajusterNiveau(1200, 0, 1600, 0),
    true,
  );
  verifier('un item réussi devient plus facile', ajusterDifficulte(1200, 0, 1200, 1) < 1200, true);
  verifier('un item manqué devient plus difficile', ajusterDifficulte(1200, 0, 1200, 0) > 1200, true);
  verifier(
    'le pas se réduit avec l’expérience',
    ajusterNiveau(1200, 100, 1200, 1) - 1200 < ajusterNiveau(1200, 0, 1200, 1) - 1200,
    true,
  );
  verifier(
    'un item bouge moins vite qu’une personne',
    Math.abs(ajusterDifficulte(1200, 0, 1200, 1) - 1200) <
      Math.abs(ajusterNiveau(1200, 0, 1200, 1) - 1200),
    true,
  );
}

console.log('\nCONVERGENCE — l’estimation retrouve un niveau connu');
{
  /** Générateur reproductible : un essai qui dépend du hasard système ne prouve rien. */
  function hasard(graine: number) {
    let etat = graine >>> 0;
    return () => {
      etat = (etat * 1664525 + 1013904223) >>> 0;
      return etat / 2 ** 32;
    };
  }

  const ecarts: number[] = [];
  for (const vrai of [900, 1100, 1200, 1400, 1600]) {
    const tirer = hasard(vrai);
    let estime = NOTE_INITIALE;
    let observations = 0;
    for (let i = 0; i < 400; i += 1) {
      // Les items sont de difficultés variées, comme une banque réelle.
      const difficulte = 900 + (i % 9) * 100;
      const reussi = tirer() < chanceDeReussite(vrai, difficulte) ? 1 : 0;
      estime = ajusterNiveau(estime, observations, difficulte, reussi);
      observations += 1;
    }
    ecarts.push(Math.abs(estime - vrai));
    console.log(`      niveau réel ${vrai} → estimé ${Math.round(estime)}`);
  }
  verifier('tous les écarts restent sous 120 points', ecarts.every((e) => e < 120), true);
}

console.log('\nUN APPRENANT QUI PROGRESSE EST SUIVI');
{
  function hasard(graine: number) {
    let etat = graine >>> 0;
    return () => {
      etat = (etat * 1664525 + 1013904223) >>> 0;
      return etat / 2 ** 32;
    };
  }
  const tirer = hasard(7);
  let estime = NOTE_INITIALE;
  let observations = 0;
  let vrai = 1000;
  for (let i = 0; i < 600; i += 1) {
    // La personne progresse régulièrement : l'estimation doit suivre, et c'est
    // précisément ce qu'un pas qui décroît sans jamais s'annuler permet.
    vrai += 1;
    const difficulte = 900 + (i % 9) * 100;
    const reussi = tirer() < chanceDeReussite(vrai, difficulte) ? 1 : 0;
    estime = ajusterNiveau(estime, observations, difficulte, reussi);
    observations += 1;
  }
  console.log(`      niveau réel final ${vrai} → estimé ${Math.round(estime)}`);
  verifier('l’estimation suit la progression', Math.abs(estime - vrai) < 150, true);
}

console.log('\nGRANULARITÉS');
{
  const trois = clefs({
    matiere: 'Droit public',
    fascicule: 'Fascicule 1',
    ficheId: 'abc',
    ficheTitre: 'Une fiche',
  });
  verifier('trois sujets touchés', trois.map((c) => c.portee), ['matiere', 'fascicule', 'fiche']);
  verifier('la clé de matière est stable', trois[0].clef, 'matiere:Droit public');
  verifier('celle de fascicule porte sa matière', trois[1].clef, 'fascicule:Droit public|Fascicule 1');
  verifier('celle de fiche porte l’identifiant', trois[2].clef, 'fiche:abc');
  verifier(
    'sans fascicule ni fiche, une seule clé',
    clefs({ matiere: 'Économie' }).length,
    1,
  );
}

console.log('\nCE QU’ON ACCEPTE D’UTILISER');
{
  verifier('une note neuve ne sert pas', utilisable({ observations: 0 }), false);
  verifier('deux réponses ne suffisent pas', utilisable({ observations: 2 }), false);
  verifier('cinq réponses suffisent', utilisable({ observations: 5 }), true);
  verifier('une amorce suffit à viser', utilisable({ observations: 0, calibree: true }), true);
}

console.log('\nAMORCES');
{
  verifier('trois crans', AMORCES.length, 3);
  verifier('ordonnés', AMORCES.map((a) => a.note), [...AMORCES.map((a) => a.note)].sort((a, b) => a - b));
  const [bas, , haut] = AMORCES;
  verifier(
    'l’écart entre les extrêmes change vraiment le contenu visé',
    Math.round((chanceDeReussite(haut.note, 1200) - chanceDeReussite(bas.note, 1200)) * 100) >= 30,
    true,
  );
}

console.log(`\n${echecs ? `\x1b[31m✖ ${echecs} échec(s)\x1b[0m` : '\x1b[32m✓ tout passe\x1b[0m'}\n`);
process.exit(echecs ? 1 : 0);
