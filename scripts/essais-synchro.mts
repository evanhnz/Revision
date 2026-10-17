/**
 * Essais de la fusion de progression entre appareils (src/lib/synchro-fusion.ts).
 *
 * Ce qui compte : aucun travail fait sur un appareil ne doit disparaître ni
 * être compté deux fois, et une carte révisée sur les deux appareils doit
 * avoir le calendrier que donnent ses deux révisions, dans l'ordre.
 */
import assert from 'node:assert/strict';
import { estVide, extraireBase, fusionner, texteStable } from '../src/lib/synchro-fusion.ts';
import { carteNeuve, noter, rejouer } from '../src/lib/srs.ts';

const vide = () => ({
  format: 'revinsp-progression' as const,
  version: 1,
  exporteLe: '2026-10-16T08:00:00.000Z',
  profil: { xp: 0, streakCourante: 0, streakRecord: 0, dernierJourEtudie: null, badges: [], creeLe: '2026-10-01T00:00:00.000Z' },
  cartes: [], fiches: [], quiz: [], jours: [], nback: [], seances: [], qcmDgfip: [], qcmSessions: [],
  relationnel: [], vmSeuils: [], vmSessions: [], journal: [], competences: [], difficultes: [],
  planification: null, reglagesSession: undefined, reglagesContenu: undefined, reglagesNiveau: undefined,
  revlog: [], activite: [],
}) as any;

const jour = (j: string, cartes: number, secondes: number, xp = 0) =>
  ({ jour: j, xp, cartes, quiz: 0, bonnes: 0, reponses: 0, secondes });
const activite = (j: string, appareil: string, cartes: number, secondes: number, xp = 0) =>
  ({ id: `${j}|${appareil}`, jour: j, appareil, xp, cartes, quiz: 0, bonnes: 0, reponses: 0, secondes });

let n = 0;
const essai = (nom: string, f: () => void) => {
  f();
  n++;
  console.log(`✓ ${nom}`);
};
const leJour = (d: any, j: string) => d.jours.find((x: any) => x.jour === j);

// Base commune : un acquis antérieur à l'historique (héritage) de 100 XP et
// 10 cartes le 15, puis une carte révisée une fois, synchronisée.
const depart = carteNeuve('a', 'f', 'm', new Date('2026-10-15T09:00:00.000Z'));
const r1 = { id: 'r1', carteId: 'a', le: '2026-10-15T10:00:00.000Z', note: 'correct', avant: depart };
const base = vide();
base.profil.xp = 100;
base.cartes = [noter(depart, 'correct', new Date(r1.le))];
base.revlog = [r1];
base.jours = [jour('2026-10-15', 10, 600, 100)];
base.seances = [{ id: 1, theme: 't', jour: '2026-10-15', statut: 'prevue', secondes: 0, note: '', etendue: false }];
const b = extraireBase(base);

/** Une copie où l'appareil « nom » a révisé « cartes » cartes le 16. */
function apres(nom: string, cartes: number, secondes: number, xp: number) {
  const d = structuredClone(base);
  d.profil.xp += xp;
  d.activite = [activite('2026-10-16', nom, cartes, secondes, xp)];
  d.jours = [...d.jours, jour('2026-10-16', cartes, secondes, xp)];
  return d;
}

essai('compteurs par appareil : les deux journées s\'additionnent', () => {
  const f = fusionner(apres('pc', 5, 300, 50), apres('tel', 3, 200, 30), b);
  assert.equal(f.profil.xp, 180);
  const j16 = leJour(f, '2026-10-16');
  assert.deepEqual([j16.cartes, j16.secondes, j16.xp], [8, 500, 80]);
  assert.equal(leJour(f, '2026-10-15').cartes, 10, 'l\'héritage ne double pas');
});

essai('fusion rejouée (envoi refusé puis repris) : rien ne double', () => {
  const pc = apres('pc', 5, 300, 50);
  const tel = apres('tel', 3, 200, 30);
  const f1 = fusionner(pc, tel, b);
  const f2 = fusionner(f1, tel, b);
  const f3 = fusionner(f2, f1, null);
  assert.equal(f3.profil.xp, 180);
  assert.equal(leJour(f3, '2026-10-16').cartes, 8);
});

essai('sans base : héritage au maximum, jamais additionné', () => {
  const tel = structuredClone(base);
  tel.profil.xp = 120;
  const f = fusionner(structuredClone(base), tel, null);
  assert.equal(f.profil.xp, 120);
  assert.equal(f.jours[0].cartes, 10);
});

essai('carte révisée sur les deux appareils : historique rejoué dans FSRS', () => {
  const pc = structuredClone(base);
  const rPc = { id: 'r2', carteId: 'a', le: '2026-10-17T08:00:00.000Z', note: 'difficile' };
  pc.revlog.push(rPc);
  pc.cartes = [noter(base.cartes[0], 'difficile', new Date(rPc.le))];
  const tel = structuredClone(base);
  const rTel = { id: 'r3', carteId: 'a', le: '2026-10-17T20:00:00.000Z', note: 'facile' };
  tel.revlog.push(rTel);
  tel.cartes = [noter(base.cartes[0], 'facile', new Date(rTel.le))];

  const f = fusionner(pc, tel, b);
  const attendu = rejouer(depart, [r1, rPc, rTel] as any);
  const carte = f.cartes.find((c: any) => c.id === 'a');
  assert.equal(carte.revisions, 3, 'les trois révisions comptent');
  assert.deepEqual(carte.fsrs, attendu.fsrs);
  assert.equal(carte.derniereRevision, rTel.le);
  // Différent de « la dernière gagne », qui ignorerait la révision du PC.
  assert.notDeepEqual(carte.fsrs, tel.cartes[0].fsrs);
  assert.equal(f.revlog.length, 3);
});

essai('carte révisée sur un seul appareil : son état, sans rejeu', () => {
  const tel = structuredClone(base);
  tel.revlog.push({ id: 'r4', carteId: 'a', le: '2026-10-17T20:00:00.000Z', note: 'oublie' });
  tel.cartes = [noter(base.cartes[0], 'oublie', new Date('2026-10-17T20:00:00.000Z'))];
  const f = fusionner(structuredClone(base), tel, b);
  assert.deepEqual(f.cartes[0], tel.cartes[0]);
});

essai('nouvelle carte d\'un seul côté : ajoutée', () => {
  const pc = structuredClone(base);
  pc.cartes.push(carteNeuve('z', 'f', 'm'));
  assert.equal(fusionner(pc, structuredClone(base), b).cartes.length, 2);
});

essai('séance supprimée d\'un côté : pas ressuscitée', () => {
  const pc = structuredClone(base);
  pc.seances = [];
  assert.equal(fusionner(pc, structuredClone(base), b).seances.length, 0);
});

essai('séance terminée d\'un côté : terminée', () => {
  const pc = structuredClone(base);
  pc.seances[0] = { ...pc.seances[0], statut: 'terminee', secondes: 900, note: 'notes' };
  const f = fusionner(pc, structuredClone(base), b);
  assert.equal(f.seances[0].statut, 'terminee');
  assert.equal(f.seances[0].id, undefined);
});

essai('événements : union sans doublon', () => {
  const pc = structuredClone(base);
  pc.quiz = [{ id: 1, ficheId: 'f', matiere: 'm', le: 'x', bonnes: 1, total: 2 }];
  const tel = structuredClone(base);
  tel.quiz = [{ id: 7, ficheId: 'f', matiere: 'm', le: 'x', bonnes: 1, total: 2 }, { id: 8, ficheId: 'f', matiere: 'm', le: 'y', bonnes: 2, total: 2 }];
  assert.equal(fusionner(pc, tel, b).quiz.length, 2);
});

essai('fusion idempotente : deux copies identiques', () => {
  const f = fusionner(structuredClone(base), structuredClone(base), b);
  const g = fusionner(f, structuredClone(f), extraireBase(f));
  assert.equal(texteStable(g), texteStable(f));
  assert.equal(f.profil.xp, 100);
});

essai('copie vide détectée', () => {
  assert.equal(estVide(vide()), true);
  assert.equal(estVide(base), false);
});

essai('empreinte insensible à la date d\'export', () => {
  assert.equal(texteStable({ ...base, exporteLe: 'autre' }), texteStable(base));
});

console.log(`\n${n} essais réussis.`);
