/**
 * Fusion de deux copies de la progression (cet appareil et le dépôt).
 *
 * Module pur, sans accès au navigateur : il est testé par
 * « scripts/essais-synchro.mts ».
 *
 * Règle générale : pour chaque élément, l'état le plus récent l'emporte. Les
 * compteurs qui s'additionnent (XP, statistiques du jour, temps de lecture)
 * font exception : si chaque appareil a révisé de son côté, garder le plus
 * grand des deux perdrait le travail de l'autre. On les fusionne donc « à
 * trois voies », à partir de la dernière copie commune (la « base ») :
 * valeur = base + gain local + gain distant. Sans base (toute première
 * synchronisation), on ne sait pas ce que les deux copies ont en commun et
 * l'on garde le maximum, qui ne compte jamais deux fois le même travail.
 */
import type { EntreeJournal, ExportProgression, Jour, Seance } from './db';

/** Ce que l'on retient de la dernière copie commune pour fusionner les compteurs. */
export interface BaseFusion {
  xp: number;
  jours: Record<string, Omit<Jour, 'jour'>>;
  secondesFiches: Record<string, number>;
  /** Séances présentes à la dernière synchronisation (clé « jour|thème »). */
  seances: string[];
}

const CHAMPS_JOUR = ['xp', 'cartes', 'quiz', 'bonnes', 'reponses', 'secondes'] as const;
const cleSeance = (s: Pick<Seance, 'jour' | 'theme'>) => `${s.jour}|${s.theme}`;

export function extraireBase(d: ExportProgression): BaseFusion {
  const jours: BaseFusion['jours'] = {};
  for (const { jour, ...reste } of d.jours ?? []) jours[jour] = reste;
  const secondesFiches: Record<string, number> = {};
  for (const f of d.fiches ?? []) secondesFiches[f.id] = f.secondes ?? 0;
  return { xp: d.profil?.xp ?? 0, jours, secondesFiches, seances: (d.seances ?? []).map(cleSeance) };
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

  const profil = {
    xp: compteur(pl.xp, pd.xp, base?.xp),
    streakCourante: serie,
    streakRecord: Math.max(pl.streakRecord, pd.streakRecord, serie),
    dernierJourEtudie: plusTard(pl.dernierJourEtudie, pd.dernierJourEtudie),
    badges: [...new Set([...pl.badges, ...pd.badges])],
    creeLe: plusTot(pl.creeLe, pd.creeLe) ?? pl.creeLe,
  };

  // Flashcards : la révision la plus récente l'emporte ; à égalité, la carte
  // la plus révisée.
  const cartes = parCle(local.cartes, distant.cartes, (c) => c.id, (l, d) => {
    const rl = l.derniereRevision ?? '';
    const rd = d.derniereRevision ?? '';
    if (rl !== rd) return rl > rd ? l : d;
    return d.revisions > l.revisions ? d : l;
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

  const jours = parCle(local.jours, distant.jours, (j) => j.jour, (l, d) => {
    const b = base?.jours[l.jour];
    const j = { jour: l.jour } as Jour;
    for (const champ of CHAMPS_JOUR) {
      j[champ] = compteur(l[champ] ?? 0, d[champ] ?? 0, base ? (b?.[champ] ?? 0) : undefined);
    }
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
  };
}

/** Vrai si la copie ne contient aucun travail (appareil neuf ou remis à zéro). */
export function estVide(d: ExportProgression): boolean {
  return (
    !(d.cartes ?? []).some((c) => c.revisions > 0) &&
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
