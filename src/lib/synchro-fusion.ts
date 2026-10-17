/**
 * Fusion de deux copies de la progression (cet appareil et le dépôt), sur le
 * modèle d'Anki.
 *
 * Module pur, sans accès au navigateur : il est testé par
 * « scripts/essais-synchro.mts ».
 *
 *  - Historique des révisions (revlog) : union. Rien ne s'y perd, rien ne s'y
 *    compte deux fois, puisque chaque ligne a un identifiant unique.
 *  - Flashcards : si une seule copie contient des révisions que l'autre n'a
 *    pas, c'est son état qui l'emporte. Si les deux en contiennent (la même
 *    carte révisée sur les deux appareils entre deux synchronisations), on
 *    rejoue tout l'historique de la carte, dans l'ordre chronologique, dans
 *    FSRS : son calendrier tient compte des deux révisions. Anki, lui, garde
 *    la dernière.
 *  - Statistiques et XP : chaque appareil a ses propres compteurs, qui ne font
 *    que croître ; on garde pour chacun le plus grand, et les totaux en sont la
 *    somme. L'acquis antérieur à l'historique (« héritage »), figé, se fusionne
 *    par le maximum.
 *  - Le reste : l'état le plus récent l'emporte, élément par élément.
 */
import type { ActiviteAppareil, EntreeJournal, EntreeRevlog, EtatCarte, ExportProgression, Jour, Seance } from './db';
import { rejouer } from './srs';

/** Ce que l'on retient de la dernière copie commune pour fusionner les compteurs. */
export interface BaseFusion {
  /** Totaux à la dernière synchronisation (anciennes versions : servent d'héritage). */
  xp: number;
  jours: Record<string, Omit<Jour, 'jour'>>;
  /** Acquis antérieur à l'historique par appareil, à la dernière synchronisation. */
  heritage?: { xp: number; jours: Record<string, Omit<Jour, 'jour'>> };
  secondesFiches: Record<string, number>;
  /** Séances présentes à la dernière synchronisation (clé « jour|thème »). */
  seances: string[];
}

const CHAMPS_JOUR = ['xp', 'cartes', 'quiz', 'bonnes', 'reponses', 'secondes'] as const;
const cleSeance = (s: Pick<Seance, 'jour' | 'theme'>) => `${s.jour}|${s.theme}`;
type Compteurs = Omit<Jour, 'jour'>;
const zero = (): Compteurs => ({ xp: 0, cartes: 0, quiz: 0, bonnes: 0, reponses: 0, secondes: 0 });

/** Somme des compteurs par appareil, par jour. */
function sommeActivite(activite: ActiviteAppareil[] = []): Map<string, Compteurs> {
  const parJour = new Map<string, Compteurs>();
  for (const a of activite) {
    const j = parJour.get(a.jour) ?? zero();
    for (const champ of CHAMPS_JOUR) j[champ] += a[champ] ?? 0;
    parJour.set(a.jour, j);
  }
  return parJour;
}

/** L'acquis antérieur à l'historique : totaux moins ce que les appareils ont compté. */
function heritage(d: ExportProgression): { xp: number; jours: Record<string, Compteurs> } {
  const somme = sommeActivite(d.activite);
  let xpCompte = 0;
  for (const c of somme.values()) xpCompte += c.xp;
  const jours: Record<string, Compteurs> = {};
  for (const { jour, ...totaux } of d.jours ?? []) {
    const compte = somme.get(jour) ?? zero();
    const h = zero();
    for (const champ of CHAMPS_JOUR) h[champ] = Math.max(0, (totaux[champ] ?? 0) - compte[champ]);
    jours[jour] = h;
  }
  return { xp: Math.max(0, (d.profil?.xp ?? 0) - xpCompte), jours };
}

export function extraireBase(d: ExportProgression): BaseFusion {
  const jours: BaseFusion['jours'] = {};
  for (const { jour, ...reste } of d.jours ?? []) jours[jour] = reste;
  const secondesFiches: Record<string, number> = {};
  for (const f of d.fiches ?? []) secondesFiches[f.id] = f.secondes ?? 0;
  return {
    xp: d.profil?.xp ?? 0,
    jours,
    heritage: heritage(d),
    secondesFiches,
    seances: (d.seances ?? []).map(cleSeance),
  };
}

/** Historique indexé par carte. */
function parCarte(revlog: EntreeRevlog[] = []): Map<string, EntreeRevlog[]> {
  const m = new Map<string, EntreeRevlog[]>();
  for (const e of revlog) {
    const liste = m.get(e.carteId);
    if (liste) liste.push(e);
    else m.set(e.carteId, [e]);
  }
  return m;
}

const chronologique = (a: EntreeRevlog, b: EntreeRevlog) => a.le.localeCompare(b.le) || a.id.localeCompare(b.id);

/** L'ancienne règle : la révision la plus récente, à égalité la carte la plus révisée. */
function plusRecemmentRevisee(l: EtatCarte, d: EtatCarte): EtatCarte {
  const rl = l.derniereRevision ?? '';
  const rd = d.derniereRevision ?? '';
  if (rl !== rd) return rl > rd ? l : d;
  return d.revisions > l.revisions ? d : l;
}

/** Compteur fusionné à trois voies ; sans base, le maximum. */
function compteur(local: number, distant: number, base: number | undefined): number {
  if (base === undefined) return Math.max(local, distant);
  return Math.max(0, local + distant - base);
}

const plusTard = (a?: string | null, b?: string | null) => ((a ?? '') >= (b ?? '') ? a ?? null : b ?? null);
const plusTot = (a?: string | null, b?: string | null) =>
  [a, b].filter((x): x is string => Boolean(x)).sort()[0] ?? null;

/** Fusionne deux listes indexées : « choisir » tranche quand l'élément existe des deux côtés. */
function parCle<T>(local: T[] = [], distant: T[] = [], cle: (e: T) => string, choisir: (l: T, d: T) => T): T[] {
  const resultat = new Map<string, T>();
  for (const e of local) resultat.set(cle(e), e);
  for (const e of distant) {
    const k = cle(e);
    const l = resultat.get(k);
    resultat.set(k, l === undefined ? e : choisir(l, e));
  }
  return [...resultat.values()];
}

/** Événements datés (quiz, sessions) : union sans doublon, identifiants retirés. */
function evenements<T extends { id?: number }>(local: T[] = [], distant: T[] = [], cle: (e: T) => string): T[] {
  return parCle(local, distant, cle, (l) => l).map(({ id: _id, ...e }) => e as T);
}

/** Moment de la dernière activité sur une entrée du journal d'erreurs. */
const activiteJournal = (e: EntreeJournal) =>
  [e.derniereErreurLe, e.derniereSession, e.fermeeLe].filter(Boolean).sort().pop() ?? '';

export function fusionner(
  local: ExportProgression,
  distant: ExportProgression,
  base: BaseFusion | null,
): ExportProgression {
  const pl = local.profil;
  const pd = distant.profil;
  // La série en cours est celle de l'appareil qui a étudié le plus récemment.
  const serie =
    (pl.dernierJourEtudie ?? '') === (pd.dernierJourEtudie ?? '')
      ? Math.max(pl.streakCourante, pd.streakCourante)
      : (pl.dernierJourEtudie ?? '') > (pd.dernierJourEtudie ?? '')
        ? pl.streakCourante
        : pd.streakCourante;

  // Compteurs : par appareil, le plus grand ; l'héritage, par différence.
  const activite = parCle(local.activite, distant.activite, (a) => a.id, (l, d) => {
    const max = { ...l };
    for (const champ of CHAMPS_JOUR) max[champ] = Math.max(l[champ] ?? 0, d[champ] ?? 0);
    return max;
  });
  const sommes = sommeActivite(activite);
  const hl = heritage(local);
  const hd = heritage(distant);
  // L'héritage est figé depuis l'arrivée de l'historique : le plus grand des
  // deux suffit, et reste juste si la fusion est rejouée (envoi refusé, reprise).
  let xpCompte = 0;
  for (const c of sommes.values()) xpCompte += c.xp;

  const profil = {
    xp: Math.max(hl.xp, hd.xp) + xpCompte,
    streakCourante: serie,
    streakRecord: Math.max(pl.streakRecord, pd.streakRecord, serie),
    dernierJourEtudie: plusTard(pl.dernierJourEtudie, pd.dernierJourEtudie),
    badges: [...new Set([...pl.badges, ...pd.badges])],
    creeLe: plusTot(pl.creeLe, pd.creeLe) ?? pl.creeLe,
  };

  // Historique des révisions : union.
  const revlog = parCle(local.revlog, distant.revlog, (e) => e.id, (l, d) => (l.avant ? l : d));
  const rl = parCarte(local.revlog);
  const rd = parCarte(distant.revlog);
  const revlogParCarte = parCarte(revlog);

  const cartes = parCle(local.cartes, distant.cartes, (c) => c.id, (l, d) => {
    const idsL = new Set((rl.get(l.id) ?? []).map((e) => e.id));
    const idsD = new Set((rd.get(l.id) ?? []).map((e) => e.id));
    const seulementL = [...idsL].some((id) => !idsD.has(id));
    const seulementD = [...idsD].some((id) => !idsL.has(id));
    if (seulementL && seulementD) {
      // Révisée des deux côtés : on rejoue tout son historique dans FSRS.
      const historique = [...(revlogParCarte.get(l.id) ?? [])].sort(chronologique);
      const depart = historique[0]?.avant;
      if (depart) return rejouer({ ...depart, ficheId: l.ficheId, matiere: l.matiere }, historique);
      return plusRecemmentRevisee(l, d);
    }
    if (seulementL) return l;
    if (seulementD) return d;
    return plusRecemmentRevisee(l, d);
  });

  const fiches = parCle(local.fiches, distant.fiches, (f) => f.id, (l, d) => ({
    ...l,
    ...d,
    lu: Boolean(l.lu || d.lu),
    secondes: compteur(l.secondes ?? 0, d.secondes ?? 0, base?.secondesFiches[l.id]),
    derniereOuverture: plusTard(l.derniereOuverture, d.derniereOuverture),
    pretesteeLe: plusTot(l.pretesteeLe, d.pretesteeLe) ?? undefined,
    pretestPasseLe: plusTard(l.pretestPasseLe, d.pretestPasseLe) ?? undefined,
    ...(l.pretestVues || d.pretestVues
      ? { pretestVues: [...new Set([...(l.pretestVues ?? []), ...(d.pretestVues ?? [])])] }
      : {}),
  }));

  // Totaux du jour = héritage fusionné + somme des compteurs de tous les appareils.
  const tousLesJours = new Set([...(local.jours ?? []).map((j) => j.jour), ...(distant.jours ?? []).map((j) => j.jour), ...sommes.keys()]);
  const jours: Jour[] = [...tousLesJours].sort().map((jour) => {
    const l = hl.jours[jour] ?? zero();
    const d = hd.jours[jour] ?? zero();
    const s = sommes.get(jour) ?? zero();
    const j = { jour } as Jour;
    for (const champ of CHAMPS_JOUR) j[champ] = Math.max(l[champ], d[champ]) + s[champ];
    return j;
  });

  const plusRecent = <T extends { majLe: string }>(l: T, d: T) => (d.majLe > l.majLe ? d : l);

  // Séances : une séance supprimée d'un côté depuis la dernière synchronisation
  // ne doit pas être ressuscitée par l'autre copie.
  const seancesBase = new Set(base?.seances ?? []);
  const clesLocales = new Set((local.seances ?? []).map(cleSeance));
  const clesDistantes = new Set((distant.seances ?? []).map(cleSeance));
  const seances = parCle(local.seances, distant.seances, cleSeance, (l, d) => {
    const terminee = l.statut === 'terminee' ? l : d.statut === 'terminee' ? d : null;
    const principale = terminee ?? (d.secondes > l.secondes ? d : l);
    return {
      ...principale,
      secondes: Math.max(l.secondes, d.secondes),
      note: (l.note ?? '').length >= (d.note ?? '').length ? l.note : d.note,
      ...(l.restitutions || d.restitutions ? { restitutions: { ...l.restitutions, ...d.restitutions } } : {}),
      ...(l.fiches || d.fiches ? { fiches: [...new Set([...(l.fiches ?? []), ...(d.fiches ?? [])])] } : {}),
    };
  })
    .filter((s) => {
      const k = cleSeance(s);
      return !(seancesBase.has(k) && (!clesLocales.has(k) || !clesDistantes.has(k)));
    })
    .map(({ id: _id, ...s }) => s as Seance);

  return {
    ...local,
    exporteLe: new Date().toISOString(),
    profil,
    cartes,
    fiches,
    jours,
    quiz: evenements(local.quiz, distant.quiz, (q) => `${q.ficheId}|${q.le}`),
    seances,
    nback: evenements(local.nback, distant.nback, (s) => s.le),
    relationnel: evenements(local.relationnel, distant.relationnel, (s) => s.le),
    vmSessions: evenements(local.vmSessions, distant.vmSessions, (s) => s.le),
    qcmSessions: evenements(local.qcmSessions, distant.qcmSessions, (s) => s.le),
    vmSeuils: parCle(local.vmSeuils, distant.vmSeuils, (s) => s.id, plusRecent),
    competences: parCle(local.competences, distant.competences, (c) => c.clef, plusRecent),
    difficultes: parCle(local.difficultes, distant.difficultes, (d) => d.id, plusRecent),
    journal: parCle(local.journal, distant.journal, (e) => e.id, (l, d) =>
      activiteJournal(d) > activiteJournal(l) ? d : l,
    ),
    qcmDgfip: parCle(local.qcmDgfip, distant.qcmDgfip, (q) => q.id, (l, d) =>
      d.derniereLe > l.derniereLe ? d : l,
    ),
    // Réglages : pas d'horodatage ; ceux de cet appareil, sauf s'il n'en a pas.
    planification: local.planification ?? distant.planification,
    reglagesSession: local.reglagesSession ?? distant.reglagesSession,
    reglagesContenu: local.reglagesContenu ?? distant.reglagesContenu,
    reglagesNiveau: local.reglagesNiveau ?? distant.reglagesNiveau,
    revlog,
    activite,
  };
}

/** Vrai si la copie ne contient aucun travail (appareil neuf ou remis à zéro). */
export function estVide(d: ExportProgression): boolean {
  return (
    !(d.cartes ?? []).some((c) => c.revisions > 0) &&
    !(d.revlog ?? []).length &&
    !(d.jours ?? []).length &&
    !(d.quiz ?? []).length &&
    !(d.fiches ?? []).some((f) => f.lu || f.secondes > 0)
  );
}

/** Texte stable de la progression, pour savoir si elle a changé depuis la dernière synchronisation. */
export function texteStable(d: ExportProgression): string {
  const { exporteLe: _e, profil, ...reste } = d;
  const { creeLe: _c, ...profilStable } = profil;
  return JSON.stringify({ ...reste, profil: profilStable });
}
