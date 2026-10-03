/**
 * Configuration centrale du site.
 * C'est le SEUL fichier à modifier pour changer le mot de passe, le nom du
 * dépôt GitHub Pages ou les réglages de chiffrement.
 */
export default {
  /** Titre affiché dans l'onglet du navigateur et l'en-tête. */
  titre: 'Révisions de droit',

  /**
   * Chemin de base du site publié. Sur GitHub Pages, la publication
   * automatique le fournit elle-même (BASE_PATH) d'après le nom du dépôt :
   * « / » pour un dépôt « <compte>.github.io », « /<dépôt> » sinon.
   * « globalThis.process » : ce fichier est aussi lu dans le navigateur.
   */
  base: globalThis.process?.env?.BASE_PATH || '/',

  /**
   * Dépôt GitHub de l'éditeur en ligne : pré-remplit l'écran de connexion de
   * l'éditeur. Le jeton d'accès, lui, se saisit sur chaque appareil.
   */
  depot: { proprietaire: 'evanhnz', nom: 'revision', branche: 'main' },

  /**
   * Empreinte SHA-256 du mot de passe, pour un message d'erreur immédiat à la
   * connexion. Laissée vide : en ligne, la publication automatique la calcule
   * à partir du secret SITE_PASSWORD (variable PUBLIC_MOT_DE_PASSE_HASH), si
   * bien que le mot de passe n'est écrit nulle part dans le dépôt. Vide, le
   * contrôle se fait sur le témoin chiffré, ce qui suffit.
   */
  motDePasseHash: '',

  /** Paramètres de dérivation de clé (PBKDF2) et de chiffrement (AES-GCM). */
  crypto: {
    iterations: 600000, // recommandation OWASP pour PBKDF2-HMAC-SHA256
    tailleSelOctets: 16,
    tailleIvOctets: 12,
    tailleCleBits: 256,
  },

  /** Comportement du glossaire automatique. */
  glossaire: {
    /** true = ne souligner que la première occurrence de chaque terme par fiche. */
    premiereOccurrenceSeulement: false,
    /** Longueur minimale d'un terme pour être détecté automatiquement. */
    longueurMinimale: 3,
  },

  /**
   * Fiches audio (« podcasts »).
   *
   * Le script parlé est produit à chaque build par « scripts/podcasts.mjs »,
   * la voix par Piper, en local : aucune fiche n'est envoyée à un service
   * tiers, et l'audio est chiffré comme le reste du contenu.
   * Voir la section « Fiches audio » du README.
   */
  podcast: {
    /**
     * Moteur de synthèse, tous deux locaux et gratuits :
     *   « kokoro » — diction nettement plus naturelle, environ cinq fois plus
     *                lente à produire. C'est le choix par défaut ;
     *   « piper »  — rapide, diction plus mécanique. Pour un essai, ou sur une
     *                machine modeste.
     */
    moteur: 'kokoro',

    /** Modèle multilingue Kokoro v1.0 ; « ff_siwis » est sa voix française. */
    kokoro: { modele: 'kokoro-multi-lang-v1_0', voix: 'ff_siwis' },

    /** Modèle Piper (une voix par modèle) : siwis et upmc sont féminines, tom masculine. */
    piper: { voix: 'fr_FR-siwis-medium' },

    /**
     * Vitesse de diction, 1 = naturelle. En dessous, la lecture se fait plus
     * lente et plus douce — ce qui convient mieux à un cours qu'à un roman.
     */
    vitesse: 0.95,

    /** Silence entre deux paragraphes, puis entre deux phrases (millisecondes). */
    silenceParagrapheMs: 560,
    silencePhraseMs: 190,

    /**
     * Encodage : « opus » (recommandé) ou « mp3 » pour un navigateur ancien.
     * Opus à 16 kbit/s en mono reste net sur de la parole et pèse deux fois
     * moins qu'un MP3 à 32 — ce qui compte, pour des dizaines d'heures.
     * En dessous de 12k, la voix devient métallique.
     */
    format: 'opus',
    bitrate: '16k',
  },

  /** Points d'expérience attribués par action. */
  xp: {
    /**
     * Quatre notes depuis le passage à FSRS. « Oublié » rapporte quelque chose :
     * la tentative a eu lieu, et c'est elle qui fait progresser la trace — ne
     * rien donner pousserait à cliquer « Difficile » sur une carte oubliée, ce
     * qui fausserait l'ordonnanceur pour gagner trois points.
     */
    flashcardOublie: 3,
    flashcardDifficile: 4,
    flashcardCorrect: 5,
    flashcardFacile: 7,
    quizTermine: 10,
    quizBonneReponse: 2,
    ficheTerminee: 20,
    /**
     * Prétest : récompense forfaitaire pour **avoir tenté**, jamais pour avoir
     * bien répondu. Se tromper avant d'avoir lu est attendu, et c'est même ce
     * qui fait l'effet ; récompenser la justesse installerait une anxiété
     * exactement là où il ne faut pas.
     */
    pretestTente: 4,
    /** Quad N-Back : base par session terminée, puis bonus selon n et réussite. */
    nbackSession: 8,
    nbackParNiveau: 4,
    nbackBonusReussite: 10,
    /**
     * Relational Reasoning : base par session, puis bonus par item réussi et
     * selon l'échelon de difficulté atteint. Un item y demande plus de temps
     * qu'une flashcard, d'où un rapport par item plus élevé.
     */
    relationnelSession: 8,
    relationnelParItem: 4,
    relationnelParPhase: 3,
    /**
     * Veridical Mapping : base par session, puis bonus par essai réussi et
     * prime à chaque paire dont le seuil se stabilise. Un essai y est très
     * court, d'où un rapport par essai bien plus faible qu'ailleurs.
     */
    veridicalSession: 6,
    veridicalParEssai: 1,
    veridicalConvergence: 25,
  },
};
