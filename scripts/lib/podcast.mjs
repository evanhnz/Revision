/**
 * Réécriture d'une fiche en script de podcast.
 *
 * Le « Cours complet » est écrit pour l'œil : titres numérotés, listes à
 * puces, tableaux, gras. Lu tel quel par une synthèse vocale, il donne un
 * texte haché, pénible à l'oreille. Ce module le réécrit comme on parlerait :
 * les titres deviennent des relances, les listes des énumérations dites, les
 * tableaux des phrases, et les abréviations sont développées (« art. 55 » se
 * dit « article 55 »).
 *
 * Deux exigences se tiennent :
 *
 *  - le ton doit être HUMAIN — on s'adresse à quelqu'un, on varie les
 *    formules, on ne récite pas trois fois « Première partie » ;
 *  - la transformation doit rester DÉTERMINISTE, pour tourner dans le flux de
 *    contenu à chaque ajout ou modification de fiche, sans intervention.
 *
 * D'où le procédé : les variantes de formulation sont tirées au sort, mais le
 * tirage est une empreinte du texte. Deux fiches ne s'enchaînent pas de la
 * même façon, et la même fiche donne toujours le même script.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { construireIndexGlossaire, normaliser } from './glossaire.mjs';

/** Version du réécriveur : la changer force la régénération de tous les scripts. */
export const VERSION_SCRIPT = 4;

/* ══════════════════════════════════════════════════════════════════════════
   Tirage reproductible
   ══════════════════════════════════════════════════════════════════════════ */

/** Empreinte entière d'une chaîne (FNV-1a) : sert de graine au tirage. */
function graine(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Choisit une variante en fonction d'une graine textuelle. */
function variante(liste, cle) {
  return liste[graine(cle) % liste.length];
}

/* ══════════════════════════════════════════════════════════════════════════
   Normalisation du texte dit à voix haute
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Juridictions et siècles : les fiches les citent en abrégé, la synthèse
 * vocale les épellerait ou les écorcherait.
 */
const REFERENCES = [
  [/\bCE Ass\./g, "Conseil d'État, Assemblée,"],
  [/\bCE Sect\./g, "Conseil d'État, Section,"],
  [/\bCE\s*,/g, "Conseil d'État,"],
  [/\bCass\.\s*Ass\.\s*pl[ée]n\./gi, 'Cassation, Assemblée plénière,'],
  [/\bCass\.\s*Crim\./gi, 'Cassation, chambre criminelle,'],
  [/\bCass\.\s*Civ\.\s*(\d)\s*(?:re|e)\b/gi, 'Cassation, $1e chambre civile,'],
  [/\bCass\.\s*Civ\./gi, 'Cassation, chambre civile,'],
  [/\bCass\.\s*Soc\./gi, 'Cassation, chambre sociale,'],
  [/\bCass\.\s*Com\./gi, 'Cassation, chambre commerciale,'],
  [/\bXXIe\b/g, 'vingt-et-unième'],
  [/\bXXe\b/g, 'vingtième'],
  [/\bXIXe\b/g, 'dix-neuvième'],
  [/\bXVIIIe\b/g, 'dix-huitième'],
  [/\bXVIIe\b/g, 'dix-septième'],
  [/\bXVIe\b/g, 'seizième'],
  [/\bXVe\b/g, 'quinzième'],
];

/** Abréviations courantes des fiches, développées pour l'oreille. */
const ABREVIATIONS = [
  [/\bart\.\s*/gi, 'article '],
  [/\bal\.\s*(?=\d)/gi, 'alinéa '],
  [/\bn°\s*/gi, 'numéro '],
  [/\bcf\.\s*/gi, 'voir '],
  [/\bp\.\s*(?=\d)/g, 'page '],
  [/\bpp\.\s*(?=\d)/g, 'pages '],
  [/\bex\.\s*:/gi, 'par exemple :'],
  [/\betc\./gi, 'et cetera'],
  [/\bc\.-à-d\./gi, "c'est-à-dire"],
  [/\benv\.\s*(?=\d)/gi, 'environ '],
  [/\bMme\b/g, 'Madame'],
  [/\bMM\.\s*/g, 'Messieurs '],
  [/\bM\.\s+(?=[A-ZÉÈÀÂÎÔÛ])/g, 'Monsieur '],
  [/\bJO\b/g, 'Journal officiel'],
  [/\bsqq\b\.?/gi, 'et suivants'],
];

/** Symboles et unités : dits en toutes lettres plutôt qu'épelés ou tus. */
const SYMBOLES = [
  [/(\d)\s*Md€/g, '$1 milliards d\u2019euros'],
  [/(\d)\s*M€/g, '$1 millions d\u2019euros'],
  [/(\d)\s*k€/g, '$1 milliers d\u2019euros'],
  [/(\d)\s*€/g, '$1 euros'],
  [/€/g, ' euros'],
  [/(\d)\s*\$/g, '$1 dollars'],
  [/(\d)\s*%/g, '$1 pour cent'],
  [/%/g, ' pour cent'],
  [/(\d)\s*°C/g, '$1 degrés'],
  [/§\s*/g, 'paragraphe '],
  [/&/g, ' et '],
  [/≈/g, ' environ '],
  [/→/g, ' devient '],
  [/×/g, ' fois '],
];

/** Ponctuation décorative : muette à l'oral, elle ne doit pas gêner. */
const PONCTUATION = [
  [/[«»""„"]/g, ''],
  [/[—–]/g, ', '],
  [/\u2026/g, '.'],
  [/\[\^[^\]]*\]/g, ''],
  [/[*_`~]/g, ''],
  [/\s*\|\s*/g, ', '],
];

/**
 * Prépare une chaîne pour la synthèse vocale.
 *
 * L'ordre compte : les espaces fines des milliers sont d'abord recollées
 * (« 4 700 » doit se dire « quatre mille sept cents », pas « quatre, sept
 * cents »), puis viennent les unités, les abréviations et la ponctuation.
 */
export function parler(texte) {
  if (!texte) return '';
  let t = texte.normalize('NFC');

  t = t.replace(/(\d)[\u202f\u00a0\u2009](?=\d{3}\b)/g, '$1');
  t = t.replace(/[\u202f\u00a0\u2009]/g, ' ');

  for (const [motif, remplacement] of REFERENCES) t = t.replace(motif, remplacement);
  for (const [motif, remplacement] of SYMBOLES) t = t.replace(motif, remplacement);
  for (const [motif, remplacement] of ABREVIATIONS) t = t.replace(motif, remplacement);
  for (const [motif, remplacement] of PONCTUATION) t = t.replace(motif, remplacement);

  // Le français met une espace devant les ponctuations doubles : on la garde
  // (le script se relit), mais jamais devant la virgule ni le point.
  return t
    .replace(/\s+/g, ' ')
    // Développer « CE Ass., » ou « Cass. Crim., » laisse deux virgules.
    .replace(/,\s*,/g, ',')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s*([;:!?])/g, ' $1')
    .trim();
}

/** Termine une phrase par un point, sauf ponctuation forte déjà présente. */
function phrase(texte) {
  const t = parler(texte).replace(/[,;:\s]+$/, '');
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Minuscule initiale, pour enchaîner un titre après une relance. */
function minusculeInitiale(texte) {
  if (!texte) return texte;
  if (/^[A-ZÉÈÀÂÎÔÛ]{2,}\b/.test(texte)) return texte; // sigle : on n'y touche pas
  return texte[0].toLowerCase() + texte.slice(1);
}

/* ══════════════════════════════════════════════════════════════════════════
   Parcours du Markdown
   ══════════════════════════════════════════════════════════════════════════ */

function texteDe(noeud) {
  if (!noeud) return '';
  if (noeud.type === 'text' || noeud.type === 'inlineCode') return noeud.value;
  if (noeud.type === 'break') return ' ';
  if (noeud.type === 'image') return '';
  if (Array.isArray(noeud.children)) return noeud.children.map(texteDe).join('');
  return '';
}

/** Retire la numérotation décorative d'un titre (« I. », « 2) », « A — »). */
function titreNu(texte) {
  return texte
    .replace(/^\s*(?:[IVXLC]+|[A-H]|\d{1,2})\s*[).:–—-]\s*/u, '')
    .replace(/^\s*[).:–—-]\s*/u, '')
    .trim();
}

/** Un titre commençant par un déterminant s'enchaîne après un verbe. */
const ENCHAINABLE = /^(le |la |les |l['\u2019]|du |des |de la |d['\u2019]|un |une |ce |cette |ces )/i;

/* --- Relances : c'est là que se joue le naturel ------------------------- */

const OUVERTURE_PARTIE = [
  'On commence par',
  'Premier temps',
  'Entrons dans le vif du sujet',
  'Première chose à voir',
];
const SUITE_PARTIE = [
  'On passe à la suite',
  'Deuxième temps',
  'Venons-en maintenant à',
  'On enchaîne avec',
  'Changement de perspective',
];
const FIN_PARTIE = [
  'Dernier temps',
  'On termine par',
  'Reste un dernier bloc',
];

const OUVERTURE_POINT = [
  'Commençons par',
  'Premier point',
  'On démarre avec',
];
const SUITE_POINT = [
  'Voyons maintenant',
  'Un mot sur',
  'Venons-en à',
  'Autre point, et il compte',
  'Passons à',
  'Deuxième chose',
];
const FIN_POINT = [
  'Terminons avec',
  'Dernier point',
  'Et on finit sur',
];

/**
 * Transforme un titre en relance parlée.
 *
 * Deux écritures selon le titre : si celui-ci commence par un déterminant, la
 * relance se prolonge dedans (« On passe à la suite : la reconnaissance
 * juridique » devient « On enchaîne avec la reconnaissance juridique ») ;
 * sinon, on annonce d'abord, on énonce ensuite, avec deux-points.
 */
function relance(niveau, titre, index, total, cle) {
  const nu = titreNu(titre);
  if (!nu) return '';

  const familles = niveau <= 3
    ? { debut: OUVERTURE_PARTIE, milieu: SUITE_PARTIE, fin: FIN_PARTIE }
    : { debut: OUVERTURE_POINT, milieu: SUITE_POINT, fin: FIN_POINT };
  const liste = index === 0 ? familles.debut : index === total - 1 && total > 1 ? familles.fin : familles.milieu;
  const amorce = variante(liste, `${cle}|${niveau}|${index}|${nu}`);

  const sujet = minusculeInitiale(parler(nu));
  // « On commence par » appelle un complément, « Premier temps » une pause.
  const fluide = /\b(par|à|avec|dans)$/.test(amorce) && ENCHAINABLE.test(nu);
  return phrase(fluide ? `${amorce} ${sujet}` : `${amorce} : ${sujet}`);
}

/** Annonces d'un exergue, quand il ne porte pas déjà son étiquette. */
const EXERGUES = [
  'Et ça, c\u2019est important.',
  'Retenez bien ceci.',
  'Le point clé, le voici.',
  'Un point à ne pas manquer.',
];

/** Annonces d'un tableau un peu long. */
const TABLEAUX = [
  'Quelques repères, dans l\u2019ordre.',
  'Prenons-les un par un.',
  'Là, il faut retenir quelques repères.',
  'Voici les repères à garder en tête.',
];

/** Liaisons entre deux éléments d'une énumération. */
const LIAISONS = ['Ensuite', 'Et puis', 'Il y a aussi', 'Par ailleurs', 'Autre chose'];

/** Une ligne de tableau devient une phrase, articulée sur l'en-tête. */
function ligneTableau(entetes, cellules) {
  const valeurs = cellules.map((c) => parler(texteDe(c)).replace(/[.;,\s]+$/, ''));
  if (valeurs.every((v) => !v)) return '';
  if (valeurs.length === 1) return phrase(valeurs[0]);
  if (valeurs.length === 2) return phrase(`${valeurs[0]} : ${valeurs[1]}`);
  const suite = valeurs
    .slice(1)
    .map((v, i) => {
      const entete = entetes[i + 1] ? minusculeInitiale(entetes[i + 1]) : '';
      return entete ? `${entete}, ${minusculeInitiale(v)}` : v;
    })
    .filter(Boolean)
    .join(' ; ');
  return phrase(`${valeurs[0]} : ${suite}`);
}

/** Titre de la grande partie qui précède un titre secondaire. */
function derniereGrandePartie(arbre, cible) {
  let courante = '';
  for (const noeud of arbre.children) {
    if (noeud === cible) break;
    if (noeud.type === 'heading' && noeud.depth <= 3) courante = texteDe(noeud);
  }
  return courante;
}

/**
 * Convertit le Markdown d'un cours en paragraphes parlés.
 * Un paragraphe du tableau retourné = une respiration à l'écoute.
 */
function paragraphesDuCours(markdown, cle) {
  const arbre = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const sortie = [];
  const ajouter = (texte, titre = false) => {
    const t = texte.trim();
    if (t) sortie.push({ texte: t, titre });
  };

  // Rang de chaque titre parmi ses frères de même niveau : « Premier temps »,
  // « Dernier temps »… dépendent de cette position.
  const rangs = new Map();
  const totaux = new Map();
  const cleDe = (noeud) =>
    noeud.depth <= 3 ? 'partie' : `sous:${derniereGrandePartie(arbre, noeud)}`;
  for (const noeud of arbre.children) {
    if (noeud.type !== 'heading') continue;
    const k = cleDe(noeud);
    rangs.set(noeud, totaux.get(k) ?? 0);
    totaux.set(k, (totaux.get(k) ?? 0) + 1);
  }

  for (const noeud of arbre.children) {
    switch (noeud.type) {
      case 'heading':
        ajouter(
          relance(noeud.depth, texteDe(noeud), rangs.get(noeud) ?? 0, totaux.get(cleDe(noeud)) ?? 1, cle),
          true,
        );
        break;

      case 'paragraph':
        ajouter(phrase(texteDe(noeud)));
        break;

      case 'blockquote': {
        const corps = noeud.children.map((e) => phrase(texteDe(e))).filter(Boolean).join(' ');
        if (!corps) break;
        // Les exergues des fiches s'ouvrent presque toujours sur leur propre
        // étiquette (« La règle : », « Le paradoxe : »). L'annoncer une
        // seconde fois lasserait : on ne le fait que pour les autres.
        const etiquete = /^[^.!?]{3,40}\s:\s/.test(corps);
        ajouter(etiquete ? corps : `${variante(EXERGUES, cle + corps.slice(0, 40))} ${corps}`);
        break;
      }

      case 'list': {
        const elements = noeud.children.map((e) => texteDe(e).trim()).filter(Boolean);
        const morceaux = elements.map((brut, i) => {
          const contenu = parler(brut).replace(/^[-–—]\s*/, '');
          if (elements.length === 1) return phrase(contenu);
          if (i === 0) return phrase(`D'abord, ${minusculeInitiale(contenu)}`);
          if (i === elements.length - 1) return phrase(`Enfin, ${minusculeInitiale(contenu)}`);
          return phrase(`${LIAISONS[(i - 1) % LIAISONS.length]}, ${minusculeInitiale(contenu)}`);
        });
        ajouter(morceaux.filter(Boolean).join(' '));
        break;
      }

      case 'table': {
        const [entete, ...lignes] = noeud.children;
        const entetes = (entete?.children ?? []).map((c) => parler(texteDe(c)));
        const phrases = lignes.map((l) => ligneTableau(entetes, l.children ?? [])).filter(Boolean);
        if (!phrases.length) break;
        if (phrases.length >= 3) ajouter(variante(TABLEAUX, cle + phrases[0]));
        // Un tableau long se découpe : mieux vaut plusieurs respirations
        // qu'un paragraphe d'une minute.
        for (let i = 0; i < phrases.length; i += 4) ajouter(phrases.slice(i, i + 4).join(' '));
        break;
      }

      default:
        break; // thematicBreak, html, code : muets
    }
  }
  return sortie;
}

/* ══════════════════════════════════════════════════════════════════════════
   Digestibilité : des phrases qu'on peut suivre à l'oreille
   ══════════════════════════════════════════════════════════════════════════ */

/** Au-delà, la phrase est trop longue pour être suivie sans la relire. */
const MOTS_PHRASE_MAX = 34;

/**
 * Points de coupure d'une phrase trop longue.
 *
 * La liste est volontairement courte : ces trois marqueurs introduisent
 * presque toujours une proposition autonome. « , et », « , alors que » ou
 * « , tandis que » coordonnent aussi bien deux sujets que deux propositions —
 * y couper produirait une phrase bancale, et le sens prime sur le confort.
 */
const RUPTURES = [', mais ', ', car ', ', si bien que '];

const compterMots = (t) => t.split(/\s+/).filter(Boolean).length;

/** Majuscule initiale, pour ouvrir une phrase issue d'une coupure. */
function majusculeInitiale(texte) {
  return texte ? texte[0].toUpperCase() + texte.slice(1) : texte;
}

/**
 * Coupe une phrase trop longue au point de rupture le plus proche de son
 * milieu — couper au premier venu déséquilibrerait les deux moitiés.
 */
function couperPhrase(p) {
  if (compterMots(p) <= MOTS_PHRASE_MAX) return [p];
  let meilleur = null;
  for (const rupture of RUPTURES) {
    let position = p.indexOf(rupture);
    while (position !== -1) {
      const gauche = compterMots(p.slice(0, position));
      const droite = compterMots(p.slice(position));
      if (gauche >= 12 && droite >= 12) {
        const ecart = Math.abs(gauche - droite);
        if (!meilleur || ecart < meilleur.ecart) meilleur = { position, rupture, ecart };
      }
      position = p.indexOf(rupture, position + 1);
    }
  }
  if (!meilleur) return [p];
  const gauche = p.slice(0, meilleur.position) + '.';
  const droite = majusculeInitiale(meilleur.rupture.replace(/^,\s*/, '')) + p.slice(meilleur.position + meilleur.rupture.length);
  return [...couperPhrase(gauche), ...couperPhrase(droite)];
}

/**
 * Aère un paragraphe : le point-virgule, qui s'entend mal, devient un point,
 * et les phrases interminables sont coupées. Rien n'est retiré du fond.
 */
function aerer(paragraphe) {
  const sansPointVirgule = paragraphe.replace(/\s*;\s*/g, (m, i, chaine) => {
    const suite = chaine.slice(i + m.length);
    return suite ? '. ' : '.';
  });
  const phrases = sansPointVirgule
    .split(/(?<=[.!?])\s+/)
    .map((p) => majusculeInitiale(p.trim()))
    .filter(Boolean)
    .flatMap(couperPhrase);
  return phrases.join(' ');
}

/* ══════════════════════════════════════════════════════════════════════════
   Explication des notions
   ══════════════════════════════════════════════════════════════════════════ */

/** Manières d'introduire l'explication d'une notion croisée en chemin. */
const GLOSES = [
  (quoi) => `Un mot d\u2019explication sur ${quoi} :`,
  (quoi) => `Précisons ${quoi} :`,
  () => 'Petit rappel au passage :',
  () => 'Pour être sûr qu\u2019on parle de la même chose :',
  (quoi) => `Arrêtons-nous une seconde sur ${quoi} :`,
];

/** Une définition trop longue perd son auditeur : on garde les deux premières phrases. */
function definitionDite(definition) {
  const phrases = parler(definition).split(/(?<=[.!?])\s+/);
  let retenu = phrases[0] ?? '';
  if (compterMots(retenu) < 22 && phrases[1]) retenu += ' ' + phrases[1];
  return retenu.replace(/[\s.]+$/, '') + '.';
}

/**
 * Explique, à sa première occurrence, chaque notion du glossaire rencontrée.
 *
 * L'explication est dite juste après le paragraphe où le mot apparaît, comme
 * une parenthèse du formateur — plutôt qu'insérée au milieu de la phrase, qui
 * deviendrait illisible. Un sigle est d'abord développé.
 */
function expliquerNotions(paragraphes, glossaire, cle) {
  if (!glossaire?.length) return paragraphes;

  const { regex, parForme } = construireIndexGlossaire(glossaire, { longueurMinimale: 3 });
  if (!regex) return paragraphes;
  const parId = new Map(glossaire.map((g) => [idDeTerme(g.terme), g]));

  const expliques = new Set();
  const sortie = [];

  for (const { texte: paragraphe, titre } of paragraphes) {
    sortie.push(paragraphe);
    if (titre) continue; // une relance de titre ne s'interrompt pas
    const gloses = [];
    for (const occurrence of paragraphe.matchAll(regex)) {
      const entree = parForme.get(normaliser(occurrence[1]));
      if (!entree || expliques.has(entree.id)) continue;
      const terme = parId.get(entree.id);
      if (!terme?.definition) continue;
      expliques.add(entree.id);
      // Deux explications d'affilée alourdissent : les suivantes attendront
      // leur prochaine occurrence, dans un paragraphe ultérieur.
      if (gloses.length >= 2) {
        expliques.delete(entree.id);
        continue;
      }
      const sigle = /^[A-ZÉÈÀ0-9]{2,}$/.test(occurrence[1]) && normaliser(occurrence[1]) !== normaliser(terme.terme);
      const amorce = variante(GLOSES, cle + entree.id);
      const enonce = sigle
        ? `${occurrence[1]}, c\u2019est-à-dire ${minusculeInitiale(parler(terme.terme))}.`
        : `${majusculeInitiale(parler(terme.terme))}.`;
      gloses.push(`${amorce(sigle ? 'ce sigle' : 'ce terme')} ${enonce} ${definitionDite(terme.definition)}`);
    }
    for (const glose of gloses) sortie.push(glose);
  }
  return sortie;
}

/** Identifiant d'un terme, identique à celui du glossaire du site. */
function idDeTerme(terme) {
  return normaliser(terme).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* ══════════════════════════════════════════════════════════════════════════
   Script complet
   ══════════════════════════════════════════════════════════════════════════ */

/** Débit moyen retenu pour l'estimation de durée (mots par minute). */
const MOTS_PAR_MINUTE = 145;

/**
 * Ouvertures et clôtures : volontairement proches d'une fiche à l'autre —
 * c'est ce qui donne au tout une identité de podcast — mais pas identiques au
 * mot près, pour ne pas donner l'impression d'un message enregistré.
 */
/**
 * Contracte l'article qui suit une préposition : « parle de les styles »
 * doit se dire « parle des styles ». Sans cela, chaque titre commençant par
 * un article trahirait la machine dès la première phrase.
 */
function apres(preposition, sujet) {
  const s = sujet.trim();
  if (preposition === 'de') {
    if (/^les\s/i.test(s)) return `des ${s.slice(4)}`;
    if (/^le\s/i.test(s)) return `du ${s.slice(3)}`;
    return `de ${s}`;
  }
  if (/^les\s/i.test(s)) return `aux ${s.slice(4)}`;
  if (/^le\s/i.test(s)) return `au ${s.slice(3)}`;
  return `à ${s}`;
}

const ACCUEILS = [
  (t) => `Bienvenue dans cette fiche audio. Aujourd'hui, on parle ${apres('de', t)}.`,
  (t) => `Bienvenue dans cette fiche audio, consacrée ${apres('à', t)}.`,
  (t) => `Bienvenue dans cette fiche audio. Au programme : ${t}.`,
];

const INVITATIONS = [
  'Installez-vous confortablement : une première écoute sans rien noter, on reprendra le détail ensuite.',
  'Prenez le temps d\u2019écouter une première fois sans rien noter ; le détail viendra après.',
  'Écoutez d\u2019abord tranquillement, sans crayon : on aura tout le temps de revenir au détail.',
];

const CONGES = [
  'Prenez quelques secondes, là, tout de suite, pour vous redire à voix haute deux ou trois choses que vous retenez.',
  'Avant de passer à autre chose, redites-vous à voix haute ce que vous en retenez : c\u2019est ce qui fixe le souvenir.',
  'Faites l\u2019effort, maintenant, de reformuler l\u2019essentiel de mémoire : c\u2019est là que ça s\u2019ancre.',
];

/**
 * Écrit le script parlé d'une fiche.
 * Retourne « null » si la fiche n'a pas de cours à dire.
 */
export function ecrireScript({ titre, matiere, fascicule, cours, glossaire }) {
  const cle = `${matiere}|${fascicule}|${titre}`;
  const bruts = paragraphesDuCours(cours ?? '', cle);
  if (!bruts.length) return null;
  const corps = expliquerNotions(
    bruts.map((p) => ({ ...p, texte: aerer(p.texte) })),
    glossaire,
    cle,
  );

  const titreDit = minusculeInitiale(parler(titre).replace(/[.\s]+$/, ''));
  const matiereDite = parler(matiere).replace(/[.\s]+$/, '');
  // « Fascicule 2 — Les acteurs… » : le tiret ne s'entend pas, la virgule si.
  const fasciculeDit = parler((fascicule ?? '').replace(/\s*[—–]\s*/, ', ')).replace(/[.\s]+$/, '');

  const ouverture = [
    variante(ACCUEILS, cle)(titreDit),
    fasciculeDit ? `Nous sommes en ${matiereDite}, ${minusculeInitiale(fasciculeDit)}.` : `Nous sommes en ${matiereDite}.`,
    variante(INVITATIONS, cle + 'i'),
  ].join(' ');

  const cloture = [
    `Voilà, on a fait le tour ${apres('de', titreDit)}.`,
    variante(CONGES, cle + 'c'),
    'Et quand vous serez prêt, la fiche simplifiée, les flashcards et le quiz vous attendent. À très bientôt.',
  ].join(' ');

  const paragraphes = [ouverture, ...corps, cloture];
  const mots = paragraphes.join(' ').split(/\s+/).filter(Boolean).length;

  return {
    paragraphes,
    mots,
    secondesEstimees: Math.round((mots / MOTS_PAR_MINUTE) * 60),
  };
}
