/**
 * Croise le manifeste (structure du contenu) avec la base locale
 * (progression) pour produire les indicateurs affichés partout :
 * maîtrise par fiche, par fascicule et par matière, file du jour, etc.
 */
import {
  aplatirFiches,
  chargerFiche,
  chargerManifeste,
  estMethodologique,
  type FicheAplatie,
  type Manifeste,
} from './contenu';
import { lireReglagesContenu } from './niveau';
import {
  ecartJours,
  jourISO,
  toutesLesCartes,
  tousLesEtatsFiches,
  tousLesResultatsQuiz,
  type EtatCarte,
} from './db';
import { maitrise } from './srs';

export interface ProgressionFiche {
  fiche: FicheAplatie;
  lu: boolean;
  cartesTotal: number;
  cartesVues: number;
  cartesAcquises: number;
  /** Cartes exigibles, inédites comprises : ce que la file du jour peut servir. */
  cartesDues: number;
  /**
   * Cartes **déjà apprises** dont l'échéance est atteinte.
   *
   * C'est le seul des deux nombres qui décrive une charge de travail réelle.
   * « Dues » compte aussi les cartes jamais vues : au démarrage, cela affichait
   * les 7 475 cartes du site comme un retard à rattraper le jour même, ce qui
   * n'annonce rien d'humainement faisable. Apprendre du neuf se décide ; revoir
   * ce qu'on a déjà appris s'impose — seul le second se compte comme un dû.
   */
  cartesARevoir: number;
  meilleurQuiz: number | null;
  maitrise: number; // 0 → 1
}

export interface ProgressionGroupe {
  nom: string;
  id: string;
  fiches: ProgressionFiche[];
  maitrise: number;
  cartesDues: number;
  cartesARevoir: number;
  fichesLues: number;
}

export interface Vue {
  manifeste: Manifeste;
  fiches: ProgressionFiche[];
  matieres: (ProgressionGroupe & { fascicules: ProgressionGroupe[] })[];
  cartesDues: number;
  cartesARevoir: number;
  maitriseGlobale: number;
}

function moyenne(valeurs: number[]): number {
  return valeurs.length ? valeurs.reduce((a, b) => a + b, 0) / valeurs.length : 0;
}

/** Construit la vue complète « contenu + progression ». */
export async function construireVue(): Promise<Vue> {
  const manifeste = await chargerManifeste();
  // Les fiches écartées des files ne pèsent pas dans les totaux : annoncer
  // « à revoir » des cartes qu'aucune session ne servira serait un décompte
  // qu'on ne peut pas faire descendre.
  const { reviserMethodologie } = await lireReglagesContenu();
  const revisable = (f: { tags?: string[] }) => reviserMethodologie || !estMethodologique(f);
  const [cartes, etatsFiches, resultats] = await Promise.all([
    toutesLesCartes(),
    tousLesEtatsFiches(),
    tousLesResultatsQuiz(),
  ]);
  const aujourdhui = jourISO();

  const cartesParFiche = new Map<string, EtatCarte[]>();
  for (const carte of cartes) {
    const liste = cartesParFiche.get(carte.ficheId) ?? [];
    liste.push(carte);
    cartesParFiche.set(carte.ficheId, liste);
  }

  const luParFiche = new Map(etatsFiches.map((e) => [e.id, e.lu]));
  const meilleurParFiche = new Map<string, number>();
  for (const r of resultats) {
    if (r.total === 0) continue;
    const taux = r.bonnes / r.total;
    meilleurParFiche.set(r.ficheId, Math.max(meilleurParFiche.get(r.ficheId) ?? 0, taux));
  }

  const progressions: ProgressionFiche[] = aplatirFiches(manifeste).map((fiche) => {
    const etats = cartesParFiche.get(fiche.id) ?? [];
    const parId = new Map(etats.map((e) => [e.id, e]));
    const lu = luParFiche.get(fiche.id) ?? false;
    const meilleurQuiz = meilleurParFiche.get(fiche.id) ?? null;

    // Les cartes jamais vues comptent comme dues et non maîtrisées.
    const cartesVues = etats.filter((e) => e.revisions > 0).length;
    const cartesAcquises = etats.filter((e) => e.intervalle >= 21).length;
    const cartesARevoir = etats.filter((e) => e.revisions > 0 && e.du <= aujourdhui).length;
    const cartesDues = fiche.nbFlashcards - cartesVues + cartesARevoir;

    const niveauxCartes: number[] = [];
    for (let i = 0; i < fiche.nbFlashcards; i++) niveauxCartes.push(0);
    let index = 0;
    for (const etat of parId.values()) {
      // Garde-fou : une carte supprimée du contenu peut subsister en base.
      if (index >= niveauxCartes.length) break;
      niveauxCartes[index++] = maitrise(etat);
    }

    const composantes: number[] = [];
    if (fiche.aCours || fiche.aFiche) composantes.push(lu ? 1 : 0);
    if (fiche.nbFlashcards > 0) composantes.push(moyenne(niveauxCartes));
    if (fiche.nbQuiz > 0) composantes.push(meilleurQuiz ?? 0);

    return {
      fiche,
      lu,
      cartesTotal: fiche.nbFlashcards,
      cartesVues,
      cartesAcquises,
      cartesDues: Math.max(0, cartesDues),
      cartesARevoir,
      meilleurQuiz,
      maitrise: moyenne(composantes),
    };
  });

  const parId = new Map(progressions.map((p) => [p.fiche.id, p]));

  const matieres = manifeste.matieres.map((m) => {
    const fascicules = m.fascicules.map((f) => {
      const fiches = f.fiches.map((x) => parId.get(x.id)!).filter(Boolean);
      return {
        id: f.id,
        nom: f.nom,
        fiches,
        maitrise: moyenne(fiches.map((x) => x.maitrise)),
        cartesDues: fiches.reduce((n, x) => n + (revisable(x.fiche) ? x.cartesDues : 0), 0),
        cartesARevoir: fiches.reduce((n, x) => n + (revisable(x.fiche) ? x.cartesARevoir : 0), 0),
        fichesLues: fiches.filter((x) => x.lu).length,
      };
    });
    const fiches = fascicules.flatMap((f) => f.fiches);
    return {
      id: m.id,
      nom: m.nom,
      fascicules,
      fiches,
      maitrise: moyenne(fiches.map((x) => x.maitrise)),
      cartesDues: fiches.reduce((n, x) => n + (revisable(x.fiche) ? x.cartesDues : 0), 0),
      cartesARevoir: fiches.reduce((n, x) => n + (revisable(x.fiche) ? x.cartesARevoir : 0), 0),
      fichesLues: fiches.filter((x) => x.lu).length,
    };
  });

  return {
    manifeste,
    fiches: progressions,
    matieres,
    cartesDues: progressions.reduce((n, p) => n + (revisable(p.fiche) ? p.cartesDues : 0), 0),
    cartesARevoir: progressions.reduce(
      (n, p) => n + (revisable(p.fiche) ? p.cartesARevoir : 0),
      0,
    ),
    maitriseGlobale: moyenne(progressions.map((p) => p.maitrise)),
  };
}

export interface CarteAReviser {
  id: string;
  question: string;
  reponse: string;
  ficheId: string;
  ficheTitre: string;
  matiere: string;
  /** true si la carte n'a encore jamais été révisée. */
  neuve: boolean;
  /** Nombre de jours de retard sur l'échéance ; 0 pour une carte neuve. */
  retard: number;
}

interface PorteeFile {
  matiere?: string | null;
  ficheId?: string | null;
  /** Restreint la file à un ensemble de fiches — rappel d'une séance passée. */
  ficheIds?: string[] | null;
}

/** Les fiches du manifeste que la portée retient. */
async function fichesEnPortee(portee: PorteeFile) {
  const { matiere = null, ficheId = null, ficheIds = null } = portee;
  const ensemble = ficheIds?.length ? new Set(ficheIds) : null;
  // Les fiches de méthodologie restent hors des files par défaut : elles
  // décrivent une épreuve, pas un savoir à retenir. Une fiche demandée
  // nommément fait exception — le bouton « réviser cette fiche » est un choix
  // explicite, là où une liste construite par une séance ne l'est pas.
  const { reviserMethodologie } = await lireReglagesContenu();
  const methodologieAdmise = reviserMethodologie || Boolean(ficheId);
  return aplatirFiches(await chargerManifeste()).filter(
    (f) =>
      f.nbFlashcards > 0 &&
      (methodologieAdmise || !estMethodologique(f)) &&
      (!matiere || f.matiere === matiere) &&
      (!ficheId || f.id === ficheId) &&
      (!ensemble || ensemble.has(f.id)),
  );
}

export interface ComptesFlashcards {
  /** Cartes exigibles : celles dont l'échéance est atteinte, et les inédites. */
  dues: number;
  /** Parmi elles, celles jamais révisées. */
  neuves: number;
  /** Cartes acquises — plus de 21 jours d'intervalle —, toutes portées confondues. */
  acquises: number;
}

/**
 * Compte les cartes d'une portée **sans déchiffrer une seule fiche**.
 *
 * C'est ce que l'écran d'accueil de session a besoin de savoir, et il n'a aucune
 * raison de le payer au prix du contenu : l'état des cartes déjà vues vit en
 * base, et le manifeste annonce combien chaque fiche en compte. La différence
 * donne les inédites. Construire la file entière pour afficher trois nombres
 * revenait à déchiffrer les 262 fiches du site à chaque ouverture de page — ce
 * qui la rendait lente, et bien souvent la faisait échouer.
 */
export async function comptesFlashcards(portee: PorteeFile = {}): Promise<ComptesFlashcards> {
  const [candidates, etats] = await Promise.all([fichesEnPortee(portee), toutesLesCartes()]);
  const aujourdhui = jourISO();
  const retenues = new Set(candidates.map((f) => f.id));

  const connuesParFiche = new Map<string, number>();
  let dues = 0;
  for (const etat of etats) {
    if (!retenues.has(etat.ficheId)) continue;
    connuesParFiche.set(etat.ficheId, (connuesParFiche.get(etat.ficheId) ?? 0) + 1);
    if (etat.du <= aujourdhui) dues += 1;
  }

  let neuves = 0;
  for (const fiche of candidates) {
    neuves += Math.max(0, fiche.nbFlashcards - (connuesParFiche.get(fiche.id) ?? 0));
  }

  return {
    dues: dues + neuves,
    neuves,
    acquises: etats.filter((e) => e.intervalle >= 21).length,
  };
}

/**
 * Construit la file de révision du jour.
 *
 * **Le déchiffrement est proportionnel à la session, pas au site.** Les cartes
 * déjà vues sont choisies et ordonnées à partir de leur seul état en base ; on
 * n'ouvre ensuite que les fiches dont une carte a effectivement été retenue. Les
 * cartes inédites, elles, ne peuvent être connues qu'en ouvrant leur fiche, mais
 * on s'arrête dès que le plafond est atteint. La version précédente ouvrait
 * toutes les fiches de la portée avant de n'en garder que vingt.
 *
 * `prioriser` réordonne les cartes déjà vues **avant** l'application du plafond.
 * Elle ne reçoit que des identifiants, et c'est le point : ce qu'on cherche à ne
 * pas déchiffrer, c'est précisément le contenu qui n'a pas été retenu.
 */
export async function fileDuJour(
  options: PorteeFile & {
    limite?: number;
    inclureNonDues?: boolean;
    prioriser?: <T extends { id: string }>(cartes: T[]) => Promise<T[]>;
  } = {},
): Promise<CarteAReviser[]> {
  const { limite = 0, inclureNonDues = false, prioriser } = options;
  const [candidates, etats] = await Promise.all([fichesEnPortee(options), toutesLesCartes()]);
  const aujourdhui = jourISO();
  const retenues = new Set(candidates.map((f) => f.id));
  const titres = new Map(candidates.map((f) => [f.id, f.titre]));
  const matieres = new Map(candidates.map((f) => [f.id, f.matiere]));

  // --- 1. Cartes déjà vues : choisies sans rien ouvrir ---------------------
  const connuesParFiche = new Map<string, number>();
  const connusIds = new Set<string>();
  const exigibles: { id: string; ficheId: string; retard: number }[] = [];
  for (const etat of etats) {
    connusIds.add(etat.id);
    if (!retenues.has(etat.ficheId)) continue;
    connuesParFiche.set(etat.ficheId, (connuesParFiche.get(etat.ficheId) ?? 0) + 1);
    if (!inclureNonDues && etat.du > aujourdhui) continue;
    exigibles.push({
      id: etat.id,
      ficheId: etat.ficheId,
      retard: Math.max(0, ecartJours(etat.du, aujourdhui)),
    });
  }
  // Les plus en retard d'abord : c'est ce qui compte quand la file déborde.
  exigibles.sort((a, b) => b.retard - a.retard);
  const ordonnees = prioriser ? await prioriser(exigibles) : exigibles;
  const servies = limite > 0 ? ordonnees.slice(0, limite) : ordonnees;

  const ouvertes = new Map<string, Awaited<ReturnType<typeof chargerFiche>>>();
  const ouvrir = async (id: string) => {
    if (!ouvertes.has(id)) ouvertes.set(id, await chargerFiche(id));
    return ouvertes.get(id)!;
  };

  const file: CarteAReviser[] = [];
  for (const choisie of servies) {
    const fiche = await ouvrir(choisie.ficheId);
    const carte = fiche.flashcards.find((c) => c.id === choisie.id);
    // Une carte dont la question a été reformulée a changé d'identifiant : son
    // ancien état survit sans contenu. On l'ignore plutôt que d'échouer.
    if (!carte) continue;
    file.push({
      id: carte.id,
      question: carte.question,
      reponse: carte.reponse,
      ficheId: fiche.id,
      ficheTitre: titres.get(fiche.id) ?? fiche.titre,
      matiere: matieres.get(fiche.id) ?? fiche.matiere,
      neuve: false,
      retard: choisie.retard,
    });
  }

  // --- 2. Cartes inédites, pour compléter ---------------------------------
  // Celles-là demandent d'ouvrir leur fiche : on n'ouvre donc que le nécessaire,
  // et on saute les fiches dont le manifeste indique qu'elles n'ont plus rien
  // d'inédit à offrir.
  for (const resume of candidates) {
    if (limite > 0 && file.length >= limite) break;
    if ((connuesParFiche.get(resume.id) ?? 0) >= resume.nbFlashcards) continue;
    const fiche = await ouvrir(resume.id);
    for (const carte of fiche.flashcards) {
      if (connusIds.has(carte.id)) continue;
      file.push({
        id: carte.id,
        question: carte.question,
        reponse: carte.reponse,
        ficheId: fiche.id,
        ficheTitre: resume.titre,
        matiere: resume.matiere,
        neuve: true,
        retard: 0,
      });
      if (limite > 0 && file.length >= limite) break;
    }
  }

  return file;
}
