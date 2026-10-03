/**
 * Plugin remark : souligne automatiquement les termes du glossaire.
 *
 * Fonctionnement :
 *  - parcourt uniquement les nœuds de texte du corps (jamais les titres,
 *    le code, les liens ni les images) ;
 *  - repère les termes du glossaire, insensible à la casse, sur des limites
 *    de mots compatibles avec les accents français ;
 *  - les termes les plus longs sont prioritaires (« droit international »
 *    avant « droit ») ;
 *  - remplace chaque occurrence par un nœud rendu en <dfn data-terme="id">.
 *
 * Le balisage manuel [[terme]] est également accepté pour forcer la détection.
 */
import { visit, SKIP } from 'unist-util-visit';

/** Retire les accents et met en minuscules : sert d'identifiant stable. */
export function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Variante qui préserve la longueur de la chaîne, caractère par caractère.
 * Indispensable pour chercher un terme désaccentué dans un texte accentué
 * tout en conservant des positions valides dans le texte d'origine :
 * « hiérarchie » devient « hierarchie », avec le même nombre de caractères.
 */
export function normaliserPositions(texte) {
  let resultat = '';
  for (const caractere of texte) {
    const base = caractere.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Si la décomposition change la longueur (ligature, caractère composé),
    // on garde le caractère d'origine pour ne pas décaler les positions.
    resultat += (base.length === 1 ? base : caractere).toLowerCase();
  }
  return resultat;
}

/** Identifiant de terme utilisable dans une URL ou un attribut HTML. */
export function idTerme(terme) {
  return normaliser(terme).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function echapperRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Construit l'index de recherche à partir des entrées du glossaire.
 * Retourne { regex, parForme } où parForme associe la forme normalisée à son id.
 */
export function construireIndexGlossaire(entrees, options = {}) {
  const longueurMinimale = options.longueurMinimale ?? 3;
  const parForme = new Map();

  for (const entree of entrees) {
    const id = idTerme(entree.terme);
    for (const forme of [entree.terme, ...(entree.formes ?? [])]) {
      const cle = normaliser(forme);
      if (cle.length < longueurMinimale) continue;
      if (!parForme.has(cle)) parForme.set(cle, { id, forme });
    }
  }

  // Les formes les plus longues d'abord : garantit que « droit international »
  // l'emporte sur « droit ».
  const formes = [...parForme.keys()].sort((a, b) => b.length - a.length);
  if (formes.length === 0) return { regex: null, parForme };

  // Les lookarounds Unicode remplacent \b, qui ne gère pas les lettres accentuées.
  const motif = formes.map((f) => echapperRegex(f)).join('|');
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${motif})(?![\\p{L}\\p{N}_])`, 'giu');
  return { regex, parForme };
}

/** Nœud mdast rendu par mdast-util-to-hast en <dfn data-terme="...">. */
function noeudDfn(texte, id) {
  return {
    type: 'glossaireTerme',
    children: [{ type: 'text', value: texte }],
    data: {
      hName: 'dfn',
      hProperties: { 'data-terme': id, class: 'terme-glossaire' },
    },
  };
}

const PARENTS_IGNORES = new Set(['heading', 'code', 'inlineCode', 'link', 'linkReference', 'image', 'definition', 'html']);

export function remarkGlossaire(options = {}) {
  const { index, premiereOccurrenceSeulement = false, dejaVus = new Set() } = options;

  return (tree) => {
    if (!index) return;
    const { regex, parForme } = index;

    visit(tree, 'text', (node, position, parent) => {
      if (!parent || PARENTS_IGNORES.has(parent.type)) return;
      if (typeof position !== 'number') return;

      const valeur = node.value;
      // La recherche s'effectue sur une copie désaccentuée de même longueur :
      // les positions trouvées restent valables dans le texte d'origine.
      const valeurNormalisee = normaliserPositions(valeur);
      const morceaux = [];
      let curseur = 0;
      let modifie = false;

      /** Ajoute le texte brut situé entre deux correspondances. */
      const pousserTexte = (fin) => {
        if (fin > curseur) morceaux.push({ type: 'text', value: valeur.slice(curseur, fin) });
      };

      // 1) Balisage manuel [[terme]] : prioritaire sur la détection automatique.
      const manuel = /\[\[([^\]]+)\]\]/g;
      const segments = [];
      let m;
      while ((m = manuel.exec(valeur)) !== null) {
        segments.push({ debut: m.index, fin: m.index + m[0].length, texte: m[1], manuel: true });
      }

      // 2) Détection automatique en dehors des zones déjà prises par [[...]].
      if (regex) {
        regex.lastIndex = 0;
        while ((m = regex.exec(valeurNormalisee)) !== null) {
          const debut = m.index;
          const fin = debut + m[0].length;
          const chevauche = segments.some((s) => debut < s.fin && fin > s.debut);
          // On réinjecte le texte d'origine (accentué, casse d'origine).
          if (!chevauche) segments.push({ debut, fin, texte: valeur.slice(debut, fin), manuel: false });
        }
      }

      segments.sort((a, b) => a.debut - b.debut);

      for (const seg of segments) {
        if (seg.debut < curseur) continue; // chevauchement résiduel : on ignore
        const cle = normaliser(seg.texte);
        const trouve = parForme.get(cle);
        const id = trouve ? trouve.id : seg.manuel ? idTerme(seg.texte) : null;
        if (!id) continue;

        if (premiereOccurrenceSeulement && dejaVus.has(id)) {
          // On garde le texte tel quel, mais on retire les crochets d'un balisage manuel.
          if (seg.manuel) {
            pousserTexte(seg.debut);
            morceaux.push({ type: 'text', value: seg.texte });
            curseur = seg.fin;
            modifie = true;
          }
          continue;
        }

        pousserTexte(seg.debut);
        morceaux.push(noeudDfn(seg.texte, id));
        dejaVus.add(id);
        curseur = seg.fin;
        modifie = true;
      }

      if (!modifie) return;
      pousserTexte(valeur.length);
      parent.children.splice(position, 1, ...morceaux);
      return [SKIP, position + morceaux.length];
    });
  };
}
