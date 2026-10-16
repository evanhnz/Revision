/**
 * Essais de la fusion de progression entre appareils (src/lib/synchro-fusion.ts).
 *
 * Ce qui compte : aucun travail fait sur un appareil ne doit disparaître ni
 * être compté deux fois quand les deux copies sont fusionnées.
 */
import assert from 'node:assert/strict';
import { estVide, extraireBase, fusionner, texteStable } from '../src/lib/synchro-fusion.ts';

const vide = () => ({
  format: 'revinsp-progression' as const,
  version: 1,
  exporteLe: '2026-10-16T08:00:00.000Z',
  profil: { xp: 0, streakCourante: 0, streakRecord: 0, dernierJourEtudie: null, badges: [], creeLe: '2026-10-01T00:00:00.000Z' },
  cartes: [], fiches: [], quiz: [], jours: [], nback: [], seances: [], qcmDgfip: [], qcmSessions: [],
  relationnel: [], vmSeuils: [], vmSessions: [], journal: [], competences: [], difficultes: [],
  planification: null, reglagesSession: undefined, reglagesContenu: undefined, reglagesNiveau: undefined,
}) as any;

const carte = (id: string, derniere: string | null, revisions: number) =>
  ({ id, ficheId: 'f', matiere: 'm', du: '2026-10-20', derniereRevision: derniere, intervalle: 1, revisions, oublis: 0, fsrs: {} });
const jour = (j: string, cartes: number, secondes: number, xp = 0) =>
  ({ jour: j, xp, cartes, quiz: 0, bonnes: 0, reponses: 0, secondes });

let n = 0;
const essai = (nom: string, f: () => void) => {
  f();
  n++;
  console.log(`✓ ${nom}`);
};

// Base commune : 1 carte révisée, 10 cartes et 600 s le 15.
const base = vide();
base.profil.xp = 100;
base.cartes = [carte('a', '2026-10-15T10:00:00.000Z', 1)];
base.jours = [jour('2026-10-15', 10, 600, 100)];
base.seances = [{ id: 1, theme: 't', jour: '2026-10-15', statut: 'prevue', secondes: 0, note: '', etendue: false }];
const b = extraireBase(base);

essai('compteurs : base + gains des deux côtés', () => {
  const pc = structuredClone(base);
  pc.profil.xp = 150;
  pc.jours = [jour('2026-10-15', 10, 600, 100), jour('2026-10-16', 5, 300, 50)];
  const tel = structuredClone(base);
  tel.profil.xp = 130;
  tel.jours = [jour('2026-10-15', 10, 600, 100), jour('2026-10-16', 3, 200, 30)];
  const f = fusionner(pc, tel, b);
  assert.equal(f.profil.xp, 180);
  const j16 = f.jours.find((j: any) => j.jour === '2026-10-16');
  assert.deepEqual([j16.cartes, j16.secondes, j16.xp], [8, 500, 80]);
  const j15 = f.jours.find((j: any) => j.jour === '2026-10-15');
  assert.equal(j15.cartes, 10, 'un jour inchangé ne doit pas doubler');
});

essai('sans base : maximum, jamais de double compte', () => {
  const pc = structuredClone(base);
  const tel = structuredClone(base);
  tel.profil.xp = 120;
  const f = fusionner(pc, tel, null);
  assert.equal(f.profil.xp, 120);
  assert.equal(f.jours[0].cartes, 10);
});

essai('cartes : la révision la plus récente l\'emporte', () => {
  const pc = structuredClone(base);
  pc.cartes = [carte('a', '2026-10-16T09:00:00.000Z', 2), carte('b', '2026-10-16T09:01:00.000Z', 1)];
  const tel = structuredClone(base);
  tel.cartes = [carte('a', '2026-10-16T18:00:00.000Z', 2), carte('c', '2026-10-16T18:01:00.000Z', 1)];
  const f = fusionner(pc, tel, b);
  assert.equal(f.cartes.length, 3);
  assert.equal(f.cartes.find((c: any) => c.id === 'a').derniereRevision, '2026-10-16T18:00:00.000Z');
});

essai('séance supprimée d\'un côté : pas ressuscitée', () => {
  const pc = structuredClone(base);
  pc.seances = [];
  const tel = structuredClone(base);
  const f = fusionner(pc, tel, b);
  assert.equal(f.seances.length, 0);
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
  assert.equal(texteStable(f), texteStable({ ...base, seances: base.seances.map(({ id, ...s }: any) => s) }));
});

essai('copie vide détectée', () => {
  assert.equal(estVide(vide()), true);
  assert.equal(estVide(base), false);
});

essai('empreinte insensible à la date d\'export', () => {
  assert.equal(texteStable({ ...base, exporteLe: 'autre' }), texteStable(base));
});

console.log(`\n${n} essais réussis.`);
