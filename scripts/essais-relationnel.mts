/**
 * Contrôle du socle de Relational Reasoning.
 *
 *   npm run essais:relationnel
 *
 * Vérifie les tables de composition, la converse, la propagation, la détection
 * d'incohérence, puis passe mille instances de chaque système au crible : aucune
 * ne doit être incohérente, et la relation du modèle caché doit toujours figurer
 * parmi celles que l'énoncé laisse possibles. Cette dernière vérification est la
 * plus utile : elle attraperait un générateur qui énonce un fait faux.
 *
 * Le script s'exécute par « tsx », seule dépendance de développement ajoutée
 * pour lui : elle ne part jamais dans le navigateur, et elle évite d'imposer au
 * reste du dépôt la convention d'imports à extension explicite qu'exigerait le
 * dépouillement de types natif de Node.
 */
import { alea } from '../src/features/relational-reasoning/noyaux/aleatoire';
import { composerChemin, possibilites, coherent } from '../src/features/relational-reasoning/noyaux/algebre';
import { line } from '../src/features/relational-reasoning/systemes/line';
import { plane } from '../src/features/relational-reasoning/systemes/plane';
import { groups } from '../src/features/relational-reasoning/systemes/groups';
import type { Systeme } from '../src/features/relational-reasoning/systemes/types';
import { SYSTEMES } from '../src/features/relational-reasoning/systemes/index';
import { MOTEURS, couples } from '../src/features/relational-reasoning/moteurs/index';
import { algebresCompatibles, INTITULES } from '../src/features/relational-reasoning/noyaux/proprietes';
import { noter } from '../src/features/relational-reasoning/noyaux/notation';
import { echelonDeMoteur } from '../src/features/relational-reasoning/progression';
import { plusPetitSuffisant, type Contexte } from '../src/features/relational-reasoning/noyaux/mus';
import { poset } from '../src/features/relational-reasoning/systemes/poset';
import type { Fait } from '../src/features/relational-reasoning/systemes/types';

function algebreDe(s: Systeme) {
  return { relations: s.relations.map((r) => r.id), converse: s.converse, composer: s.composer! };
}
const nom = (s: Systeme, id: string) => s.relations.find((r) => r.id === id)!.libelle;

let echecs = 0;
function verifier(titre: string, obtenu: unknown, attendu: unknown) {
  const a = JSON.stringify(obtenu);
  const b = JSON.stringify(attendu);
  const ok = a === b;
  if (!ok) echecs += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${titre}${ok ? '' : `\n      obtenu  ${a}\n      attendu ${b}`}`);
}
const tri = (e: Set<string>) => [...e].sort();

console.log('\nALGÈBRE DE POINTS — line (axe strict, pas d\'égalité)');
const al = algebreDe(line);
verifier('vocabulaire', line.relations.map((r) => r.id).sort(), ['a', 'p']);
verifier('avant ∘ avant = avant', tri(al.composer('a', 'a')), ['a']);
verifier('avant ∘ après indéterminé', tri(al.composer('a', 'p')), ['a', 'p']);
verifier('converse involutive', al.converse(al.converse('a')), 'a');

console.log('\nPRODUIT — plane (« nord » ∘ « est » = « nord-est »)');
const ap = algebreDe(plane);
verifier('nord ∘ est = nord-est', tri(ap.composer('ep', 'pe')), ['pp']);
verifier('libellé de pp', nom(plane, 'pp'), 'est au nord-est de');
verifier('nord ∘ sud laisse la colonne', tri(ap.composer('ep', 'ea')), ['ea', 'ee', 'ep']);
verifier('nord-est ∘ sud-ouest : neuf cas', ap.composer('pp', 'aa').size, 9);
verifier('converse de nord-est = sud-ouest', ap.converse('pp'), 'aa');
verifier('vocabulaire de plane', plane.relations.length, 9);

console.log('\nÉQUILIBRE STRUCTUREL — groups (Z₂)');
const ag = algebreDe(groups);
verifier('allié ∘ allié = allié', tri(ag.composer('allie', 'allie')), ['allie']);
verifier('allié ∘ rival = rival', tri(ag.composer('allie', 'rival')), ['rival']);
verifier('rival ∘ rival = allié', tri(ag.composer('rival', 'rival')), ['allie']);

console.log('\nCHAÎNE');
verifier('trois pas vers l\'est', tri(composerChemin(ap, ['pe', 'pe', 'pe'])), ['pe']);
verifier('est puis nord', tri(composerChemin(ap, ['pe', 'ep'])), ['pp']);

console.log('\nINDÉTERMINATION — ce dont vivent les moteurs de la catégorie C');
const faits = [
  { sujet: 'A', relation: 'a', objet: 'B' },
  { sujet: 'C', relation: 'a', objet: 'B' },
];
verifier(
  'A avant B, C avant B → A vs C ouvert',
  tri(possibilites(al, line.cheminComplet, ['A', 'B', 'C'], faits, 'A', 'C')),
  ['a', 'p'],
);
const chaine = [
  { sujet: 'A', relation: 'a', objet: 'B' },
  { sujet: 'B', relation: 'a', objet: 'C' },
];
verifier(
  'A avant B avant C → A avant C, fermé',
  tri(possibilites(al, line.cheminComplet, ['A', 'B', 'C'], chaine, 'A', 'C')),
  ['a'],
);

console.log('\nINCOHÉRENCE — ce que détecte le moteur Contradiction');
const cycle = [
  { sujet: 'A', relation: 'a', objet: 'B' },
  { sujet: 'B', relation: 'a', objet: 'C' },
  { sujet: 'C', relation: 'a', objet: 'A' },
];
verifier('cycle avant-avant-avant impossible', coherent(al, line.cheminComplet, ['A', 'B', 'C'], cycle), false);
const triangleDesequilibre = [
  { sujet: 'X', relation: 'allie', objet: 'Y' },
  { sujet: 'Y', relation: 'allie', objet: 'Z' },
  { sujet: 'X', relation: 'rival', objet: 'Z' },
];
verifier('triangle déséquilibré impossible', coherent(ag, groups.cheminComplet, ['X', 'Y', 'Z'], triangleDesequilibre), false);

console.log('\nGÉNÉRATEURS — cohérence de mille instances, tous paliers');
for (const systeme of [line, plane, groups]) {
  const a = algebreDe(systeme);
  let mauvaises = 0;
  let desaccords = 0;
  for (let graine = 1; graine <= 1000; graine += 1) {
    const hasard = alea(graine);
    const difficulte = 1 + (graine % 10);
    const instance = systeme.engendrer(difficulte, hasard);
    if (!coherent(a, systeme.cheminComplet, instance.entites, instance.faits)) mauvaises += 1;
    // La relation du modèle doit toujours figurer parmi les possibles.
    for (const x of instance.entites) {
      for (const y of instance.entites) {
        if (x === y) continue;
        const vraie = systeme.relationDansModele(instance.modele!, x, y);
        const ouvertes = possibilites(a, systeme.cheminComplet, instance.entites, instance.faits, x, y);
        if (!ouvertes.has(vraie)) desaccords += 1;
      }
    }
  }
  verifier(`${systeme.id} : instances incohérentes`, mauvaises, 0);
  verifier(`${systeme.id} : modèle exclu des possibles`, desaccords, 0);
}


console.log('\nBARÈME — il doit décourager la devinette');
{
  const reponse = {
    genre: 'multiple' as const,
    options: [{ texte: 'a' }, { texte: 'b' }, { texte: 'c' }, { texte: 'd' }],
    bonnes: [0, 1],
  };
  verifier('réponse exacte', noter(reponse, { genre: 'multiple', choix: [0, 1] }), 1);
  verifier('tout cocher', noter(reponse, { genre: 'multiple', choix: [0, 1, 2, 3] }), 0);
  verifier('une bonne sur deux, sans faute', noter(reponse, { genre: 'multiple', choix: [0] }), 0.5);
  verifier('une bonne et une fausse', noter(reponse, { genre: 'multiple', choix: [0, 2] }), 0);
  verifier('rien de coché', noter(reponse, { genre: 'multiple', choix: [] }), 0);
  const partielle = noter(reponse, { genre: 'multiple', choix: [0] });
  const fausse = noter(reponse, { genre: 'multiple', choix: [2, 3] });
  verifier('partielle > fausse', partielle > fausse, true);
  verifier('partielle < exacte', partielle < 1, true);
}

console.log("\nÉCHELLE — chaque moteur monte pour son propre compte");
{
  const t = (moteur: string, note: number) => ({ moteur, systeme: 'line', note });
  verifier('historique vide', echelonDeMoteur([], 'x'), 1);
  verifier(
    'trois réussites font monter d\'un cran',
    echelonDeMoteur([t('x', 1), t('x', 1), t('x', 1)], 'x'),
    2,
  );
  verifier(
    'les réussites d\'un autre moteur ne comptent pas',
    echelonDeMoteur([t('y', 1), t('y', 1), t('y', 1)], 'x'),
    1,
  );
  verifier(
    'deux fautes de suite font redescendre',
    echelonDeMoteur([t('x', 1), t('x', 1), t('x', 1), t('x', 0), t('x', 0)], 'x'),
    1,
  );
  verifier(
    'une réponse partielle maintient',
    echelonDeMoteur([t('x', 1), t('x', 1), t('x', 1), t('x', 0.5), t('x', 0.5)], 'x'),
    2,
  );
}

console.log('\nPRÉMISSES MINIMALES — la caractérisation linéaire égale l’énumération');
// Le noyau ne cherche plus le plus petit sous-ensemble suffisant en parcourant
// les 2^n sous-ensembles : il retient les faits *nécessaires* — ceux dont le
// retrait à lui seul fait perdre la conclusion — et vérifie qu'ils suffisent
// (la preuve est en tête de noyaux/mus.ts). Le nombre de tests passe de 4 096 à
// treize ; encore faut-il que la réponse soit la même. On la compare donc à
// l'énumération exhaustive, sur des ensembles assez petits pour qu'elle reste
// abordable.
// La référence n'appelle pas `entraine` : celui-ci prend trois raccourcis par
// la cohérence par chemin, et une erreur commune aux deux passerait inaperçue.
// Elle énumère les possibles sans aucun seuil d'arrêt.
function suffitSansRaccourci(
  contexte: Contexte,
  faits: readonly Fait[],
  a: string,
  b: string,
  relation: string,
): boolean {
  const restantes = possibilites(
    contexte.algebre,
    contexte.cheminComplet,
    contexte.entites,
    faits,
    a,
    b,
  );
  return restantes.size === 1 && restantes.has(relation);
}

function minimauxSuffisants(
  contexte: Contexte,
  faits: readonly Fait[],
  a: string,
  b: string,
  relation: string,
): Fait[][] {
  const n = faits.length;
  const suffisants: number[] = [];
  for (let masque = 1; masque < 1 << n; masque += 1) {
    const sous = faits.filter((_, i) => masque & (1 << i));
    if (suffitSansRaccourci(contexte, sous, a, b, relation)) suffisants.push(masque);
  }
  return suffisants
    .filter((m) => !suffisants.some((autre) => autre !== m && (autre & m) === autre))
    .map((m) => faits.filter((_, i) => m & (1 << i)));
}

{
  const MAXIMUM_FAITS = 8; // 256 sous-ensembles à énumérer, pas davantage
  let compares = 0;
  let desaccords = 0;
  let uniques = 0;
  for (const systeme of [line, plane, poset]) {
    const contexteAlgebre = algebreDe(systeme);
    for (let graine = 1; graine <= 120; graine += 1) {
      const hasard = alea(7000 + graine);
      const instance = systeme.engendrer(5, hasard);
      if (!instance.modele) continue;
      const entites = instance.entites;
      if (entites.length < 4) continue;
      const contexte: Contexte = {
        algebre: contexteAlgebre,
        cheminComplet: systeme.cheminComplet,
        entites,
      };
      // Un vivier de faits vrais tirés du modèle, indépendant du moteur : on
      // veut éprouver le noyau, pas reproduire la façon dont un moteur l'appelle.
      const vivier: Fait[] = [];
      for (let i = 0; i < entites.length; i += 1) {
        for (let j = i + 1; j < entites.length; j += 1) {
          vivier.push({
            sujet: entites[i],
            relation: systeme.relationDansModele(instance.modele, entites[i], entites[j]),
            objet: entites[j],
          });
        }
      }
      const [a, b] = hasard.plusieurs(entites, 2);
      const faitsTires = hasard
        .melanger(vivier.filter((f) => !((f.sujet === a && f.objet === b) || (f.sujet === b && f.objet === a))))
        .slice(0, MAXIMUM_FAITS);
      if (faitsTires.length < 3) continue;
      const conclusion = systeme.relationDansModele(instance.modele, a, b);
      if (!suffitSansRaccourci(contexte, faitsTires, a, b, conclusion)) continue;

      const obtenu = plusPetitSuffisant(contexte, faitsTires, a, b, conclusion);
      const references = minimauxSuffisants(contexte, faitsTires, a, b, conclusion);
      compares += 1;
      const attenduUnique = references.length === 1;
      if (attenduUnique) uniques += 1;
      if (!obtenu || obtenu.unique !== attenduUnique) {
        desaccords += 1;
        continue;
      }
      // Le sous-ensemble rendu doit être minimal, et le plus petit quand il est unique.
      const rendu = new Set(obtenu.faits);
      const estMinimal = references.some(
        (r) => r.length === rendu.size && r.every((f) => rendu.has(f)),
      );
      if (!estMinimal) desaccords += 1;
      else if (attenduUnique && obtenu.faits.length !== Math.min(...references.map((r) => r.length))) {
        desaccords += 1;
      }
    }
  }
  verifier('accord avec l’énumération exhaustive', desaccords, 0);
  verifier('des cas à réponse unique ont été rencontrés', uniques > 0, true);
  verifier('des cas à plusieurs minimaux aussi', compares - uniques > 0, true);
}

console.log('\nCOÛT — un item ne doit pas figer l’interface');
// Un moteur qui met vingt secondes à rendre un item est un défaut, même si
// l'item est juste : la session se fige au tirage, et rien dans les essais ne
// le disait. C'est arrivé — « Prémisses minimales » sur RCC8 demandait 18,9 s,
// parce qu'un test d'entraînement y coûte une énumération de scénarios et que
// le noyau en faisait 4 096. Le budget est désormais gardé.
{
  const BUDGET_MS = 1500;
  let pire = { couple: '—', ms: 0 };
  for (const { moteur, systeme } of couples(MOTEURS, SYSTEMES)) {
    const debut = Date.now();
    for (let i = 0; i < 3; i += 1) moteur.engendrer(systeme, 6, alea(4000 + i));
    const ms = (Date.now() - debut) / 3;
    if (ms > pire.ms) pire = { couple: `${moteur.id} × ${systeme.id}`, ms };
    if (ms > BUDGET_MS) {
      echecs += 1;
      console.log(`  ✗ ${moteur.id} × ${systeme.id} — ${Math.round(ms)} ms par item`);
    }
  }
  console.log(`  ✓ le plus lent : ${pire.couple} — ${Math.round(pire.ms)} ms par item`);
}

console.log('\nMOTEURS — deux cents items par couple moteur × système');

/**
 * Chaque item est validé **tel que la personne le voit** : on reparse l'énoncé
 * affiché plutôt que de faire confiance aux étiquettes internes du générateur.
 * Un moteur qui afficherait un motif ne portant pas sa réponse serait pris ici,
 * et nulle part ailleurs.
 */
for (const { moteur, systeme } of couples(MOTEURS, SYSTEMES)) {
  let nuls = 0;
  const griefs: string[] = [];

  for (let graine = 1; graine <= 200; graine += 1) {
    const item = moteur.engendrer(systeme, 1 + (graine % 10), alea(graine * 7919));
    if (!item) {
      nuls += 1;
      continue;
    }

    // Invariants communs à tous les moteurs.
    if (item.reponse.genre === 'unique') {
      const { options, bonne } = item.reponse;
      if (bonne < 0 || bonne >= options.length) griefs.push(`graine ${graine} : index de bonne réponse hors bornes`);
      // On compare l'option entière, texte **et** dessin. Ne comparer que le
      // texte laisserait passer deux dessins identiques — et signalerait à
      // tort comme doublons quatre options purement graphiques, dont le texte
      // est vide par construction.
      const empreintes = options.map((o) => JSON.stringify([o.texte ?? '', o.blocs ?? null]));
      if (new Set(empreintes).size !== empreintes.length) griefs.push(`graine ${graine} : options en doublon`);
      if (options.length < 2) griefs.push(`graine ${graine} : moins de deux options`);
    }
    if (item.reponse.genre === 'appariement') {
      const { gauche, droite, paires } = item.reponse;
      if (Object.keys(paires).length !== gauche.length) griefs.push(`graine ${graine} : appariement incomplet`);
      for (const [clef, valeur] of Object.entries(paires)) {
        if (!gauche.includes(clef)) griefs.push(`graine ${graine} : clé « ${clef} » absente de gauche`);
        if (!droite.includes(valeur)) griefs.push(`graine ${graine} : valeur « ${valeur} » absente de droite`);
      }
      if (new Set(Object.values(paires)).size !== Object.values(paires).length) {
        griefs.push(`graine ${graine} : deux entités appariées à la même`);
      }
    }
    if (item.reponse.genre === 'multiple') {
      const { options, bonnes } = item.reponse;
      if (!bonnes.length) griefs.push(`graine ${graine} : aucune bonne réponse`);
      if (bonnes.some((i) => i < 0 || i >= options.length)) {
        griefs.push(`graine ${graine} : index de bonne réponse hors bornes`);
      }
      if (new Set(bonnes).size !== bonnes.length) griefs.push(`graine ${graine} : bonne réponse en double`);
      // L'invariant anti-devinette : autant de leurres que de bonnes réponses au
      // moins, sans quoi tout cocher rapporterait des points.
      const leurres = options.length - bonnes.length;
      if (leurres < bonnes.length) {
        griefs.push(`graine ${graine} : ${leurres} leurre(s) pour ${bonnes.length} bonne(s) réponse(s)`);
      }
      const toutCocher = noter(item.reponse, {
        genre: 'multiple',
        choix: options.map((_, i) => i),
      });
      if (toutCocher > 0) griefs.push(`graine ${graine} : tout cocher rapporte ${toutCocher}`);
      const exact = noter(item.reponse, { genre: 'multiple', choix: bonnes });
      if (exact !== 1) griefs.push(`graine ${graine} : la réponse exacte ne vaut pas 1`);
    }
    if (!item.explication.trim()) griefs.push(`graine ${graine} : explication vide`);

    // Contrôle propre à « Algèbre cachée » : les paires affichées doivent
    // n'admettre qu'une seule algèbre, et ce doit être celle cochée.
    if (moteur.id === 'algebre-cachee' && item.reponse.genre === 'unique') {
      const bloc = item.enonce.find((b) => b.type === 'faits');
      const lignes = bloc && bloc.type === 'faits' ? bloc.phrases : [];
      const paires = lignes
        .map((ligne) => ligne.replace(/\.$/, '').split(/\s+/))
        .filter((morceaux) => morceaux.length === 3)
        .map(([a, , b]) => [a, b] as [string, string]);
      const entites = [...new Set(paires.flat())];
      const symetrique = paires.every(([a, b]) => paires.some(([c, d]) => c === b && d === a));
      const completes = symetrique ? paires : paires;
      const compatibles = algebresCompatibles(entites, completes);
      if (compatibles.length !== 1) {
        griefs.push(`graine ${graine} : ${compatibles.length} algèbres compatibles avec le motif affiché`);
      } else if (INTITULES[compatibles[0]] !== item.reponse.options[item.reponse.bonne].texte) {
        griefs.push(`graine ${graine} : l'algèbre cochée n'est pas celle du motif affiché`);
      }
    }

    // Contrôle propre à « Réseau relationnel » : l'appariement annoncé doit
    // transporter la première matrice sur la seconde, et être le seul à le
    // faire.
    if (moteur.id === 'reseau-relationnel' && item.reponse.genre === 'appariement') {
      const tableaux = item.enonce.filter((b) => b.type === 'tableau');
      if (tableaux.length !== 2) {
        griefs.push(`graine ${graine} : ${tableaux.length} matrice(s) au lieu de deux`);
      } else {
        const lire = (bloc: typeof tableaux[0]) => {
          if (bloc.type !== 'tableau') return { noms: [] as string[], cases: {} as Record<string, string> };
          const noms = bloc.entetes.slice(1);
          const cases: Record<string, string> = {};
          bloc.lignes.forEach((ligne) => {
            ligne.slice(1).forEach((valeur, j) => {
              cases[`${ligne[0]}|${noms[j]}`] = valeur;
            });
          });
          return { noms, cases };
        };
        const un = lire(tableaux[0]);
        const deux = lire(tableaux[1]);
        const pi = item.reponse.paires;
        let transporte = true;
        for (const a of un.noms) {
          for (const b of un.noms) {
            if (a === b) continue;
            if (un.cases[`${a}|${b}`] !== deux.cases[`${pi[a]}|${pi[b]}`]) transporte = false;
          }
        }
        if (!transporte) griefs.push(`graine ${graine} : l'appariement ne transporte pas la structure`);
      }
    }
  }

  const rendement = ((200 - nuls) / 200) * 100;
  const etiquette = `${moteur.id} × ${systeme.id}`;
  if (griefs.length) {
    echecs += 1;
    console.log(`  ✗ ${etiquette} — ${griefs.length} grief(s)`);
    for (const grief of griefs.slice(0, 3)) console.log(`      ${grief}`);
  } else if (nuls === 200) {
    // Un rendement nul n'est pas un défaut si le moteur a de bonnes raisons de
    // refuser ce système : « groups » n'est presque jamais rigide, faute de quoi
    // l'appariement aurait plusieurs réponses. On le signale sans échouer.
    console.log(`  – ${etiquette} — aucun item : le moteur refuse ce système`);
  } else {
    console.log(`  ✓ ${etiquette} — ${rendement.toFixed(0)} % de tirages retenus`);
  }
}

console.log(`\n${echecs ? `\x1b[31m✖ ${echecs} échec(s)\x1b[0m` : '\x1b[32m✓ tout passe\x1b[0m'}\n`);
process.exit(echecs ? 1 : 0);
