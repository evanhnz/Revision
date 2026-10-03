/**
 * Le modèle d'intervalles, et les tables de composition qu'on en dérive.
 *
 * `allen` et `rcc8` sont les deux algèbres de relations dont la cohérence de
 * chemin ne suffit pas, et ce sont aussi celles dont les tables de composition
 * sont les plus lourdes : soixante-neuf entrées pour l'une, soixante-quatre pour
 * l'autre. Les recopier à la main est le moyen le plus sûr d'introduire une
 * erreur indétectable — un exercice dont la réponse est fausse pour une seule
 * paire de relations sur cent soixante-neuf ne se remarque pas.
 *
 * D'où le choix fait ici : **on ne recopie aucune table, on les calcule.** Les
 * deux systèmes partagent un modèle concret — des segments sur une droite
 * graduée —, un classifieur dit quelle relation tient entre deux segments, et la
 * table de composition s'obtient par énumération exhaustive des triplets :
 *
 *   r ∘ s = { t : il existe A, B, C tels que A r B, B s C et A t C }
 *
 * C'est la **définition** de la composition, appliquée directement. La table est
 * donc correcte par construction pour le modèle retenu, et l'ajout d'une
 * relation ne demande pas de réviser soixante-quatre cases.
 *
 * **Ce que ce choix implique, et qu'il faut assumer.** La table obtenue est celle
 * du modèle des **segments**, non celle de la théorie RCC8 abstraite, qui admet
 * des régions quelconques du plan. Elle peut donc être plus **serrée** : des
 * configurations impossibles avec deux segments sont possibles avec deux taches.
 * Les deux systèmes annoncent donc des segments et des intervalles, jamais des
 * « régions » au sens général — l'exercice porte sur ce qui est affiché, et ce
 * qui est affiché est une droite graduée.
 *
 * La cohérence de chemin reste **incomplète** pour ces deux algèbres : c'est une
 * propriété de leur structure, que le passage par un modèle ne change pas. Les
 * deux systèmes déclarent `cheminComplet: false` et passent par l'énumération de
 * scénarios.
 */

/** Un segment de la droite graduée : début strictement avant la fin. */
export interface Segment {
  debut: number;
  fin: number;
}

/**
 * La graduation. Onze points donnent cinquante-cinq segments, soit cent
 * soixante-six mille triplets — quelques dizaines de millisecondes, une fois
 * pour toutes au premier appel. Une graduation plus courte risquerait de rendre
 * inaccessibles certaines compositions faute de place ; une plus longue ne
 * changerait rien au résultat, la composition d'une algèbre d'intervalles étant
 * insensible à l'échelle au-delà d'un petit seuil.
 */
const POINTS = 11;

export function tousLesSegments(): Segment[] {
  const segments: Segment[] = [];
  for (let debut = 0; debut < POINTS; debut += 1) {
    for (let fin = debut + 1; fin < POINTS; fin += 1) segments.push({ debut, fin });
  }
  return segments;
}

/** Un classifieur : la relation qui tient d'un segment vers un autre. */
export type Classifieur = (a: Segment, b: Segment) => string;

export interface TableDerivee {
  /** `composition[r][s]` : les relations possibles de A vers C. */
  composition: Record<string, Record<string, string[]>>;
  /** Les relations effectivement réalisées par le modèle. */
  realisees: string[];
}

const memo = new Map<Classifieur, TableDerivee>();

/**
 * Dérive la table de composition d'un classifieur par énumération exhaustive.
 *
 * Le calcul est fait une fois par classifieur et mémoïsé : les systèmes sont des
 * singletons, si bien que chaque table n'est construite qu'une fois par
 * exécution.
 */
export function deriverTable(classer: Classifieur): TableDerivee {
  const connu = memo.get(classer);
  if (connu) return connu;

  const segments = tousLesSegments();
  const n = segments.length;

  // On préclasse toutes les paires : sans cela le triple parcours appellerait le
  // classifieur trois fois par triplet, soit un demi-million d'appels inutiles.
  const relation: string[][] = segments.map((a) => segments.map((b) => classer(a, b)));

  const ensembles = new Map<string, Map<string, Set<string>>>();
  const realisees = new Set<string>();
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) realisees.add(relation[i][j]);
  }

  for (const r of realisees) {
    const ligne = new Map<string, Set<string>>();
    for (const s of realisees) ligne.set(s, new Set<string>());
    ensembles.set(r, ligne);
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const r = relation[i][j];
      const ligne = ensembles.get(r) as Map<string, Set<string>>;
      for (let k = 0; k < n; k += 1) {
        const s = relation[j][k];
        (ligne.get(s) as Set<string>).add(relation[i][k]);
      }
    }
  }

  const composition: Record<string, Record<string, string[]>> = {};
  for (const [r, ligne] of ensembles) {
    composition[r] = {};
    for (const [s, valeurs] of ligne) composition[r][s] = [...valeurs];
  }

  const table: TableDerivee = { composition, realisees: [...realisees] };
  memo.set(classer, table);
  return table;
}

/**
 * Tire des segments distincts deux à deux, de longueurs variées.
 *
 * « Distincts deux à deux » n'est pas une commodité : deux segments identiques
 * seraient dans la relation « égale », qui est légitime mais dont la présence
 * répétée appauvrirait les instances. On accepte au plus une paire égale, et
 * seulement si le tirage la donne.
 */
export function tirerSegments(
  combien: number,
  entier: (borne: number) => number,
): Segment[] {
  const choisis: Segment[] = [];
  let garde = 0;
  while (choisis.length < combien && garde < 400) {
    garde += 1;
    const debut = entier(POINTS - 1);
    const longueur = 1 + entier(Math.min(5, POINTS - 1 - debut));
    const candidat = { debut, fin: debut + longueur };
    if (choisis.some((s) => s.debut === candidat.debut && s.fin === candidat.fin)) continue;
    choisis.push(candidat);
  }
  return choisis;
}
