/// <reference types="astro/client" />

// La configuration du site est un module JS pur, importé par les scripts TS.
declare module '*/site.config.mjs' {
  const config: {
    titre: string;
    base: string;
    depot: { proprietaire: string; nom: string; branche: string };
    motDePasseHash: string;
    crypto: {
      iterations: number;
      tailleSelOctets: number;
      tailleIvOctets: number;
      tailleCleBits: number;
    };
    glossaire: { premiereOccurrenceSeulement: boolean; longueurMinimale: number };
    xp: Record<string, number>;
  };
  export default config;
}

declare module '*?raw' {
  const texte: string;
  export default texte;
}

interface ImportMetaEnv {
  readonly PUBLIC_MOT_DE_PASSE_HASH?: string;
}
