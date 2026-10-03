/**
 * La chaîne Web Audio des stimuli sonores.
 *
 * Elle est écrite ici de bout en bout : contrairement à ce qu'indiquait le
 * cahier des charges, **aucune infrastructure Web Audio n'existait dans le
 * site**. Les podcasts de fiches sont des fichiers « .opus » synthétisés hors
 * ligne et lus par un lecteur ; le Quad N-Back joue des sons préenregistrés par
 * l'API Audio. Ni l'un ni l'autre ne synthétise quoi que ce soit, et produire
 * des sons dont l'intensité, la hauteur et la durée varient au pas près demande
 * un oscillateur.
 *
 * Une centaine de lignes et aucune dépendance, ce qui reste cohérent avec le
 * reste du projet.
 */

let contexte: AudioContext | null = null;

/** Le contexte, créé au premier besoin : en créer un au chargement serait refusé. */
function obtenirContexte(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!contexte) {
    const Constructeur =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructeur) return null;
    contexte = new Constructeur();
  }
  return contexte;
}

export function disponible(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext,
  );
}

/**
 * Débloque la lecture. Les navigateurs exigent qu'un contexte audio démarre
 * depuis un geste de l'utilisateur ; on le fait au clic sur « Commencer ».
 */
export async function debloquer(): Promise<boolean> {
  const ctx = obtenirContexte();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

/** Durée des fondus, en secondes : sans eux, chaque son claque. */
const FONDU = 0.012;

export interface Ton {
  frequenceHz: number;
  niveauDb: number;
  dureeMs: number;
}

/**
 * Joue un ton et rend la main quand il est fini.
 *
 * Le niveau est donné en décibels relatifs au plein échelle, converti en gain
 * linéaire. Les plages des dimensions le maintiennent bien au-dessous de 1 :
 * le plus fort des stimuli est à −3 dB, soit un gain de 0,7.
 */
export function jouerTon({ frequenceHz, niveauDb, dureeMs }: Ton): Promise<void> {
  const ctx = obtenirContexte();
  if (!ctx || ctx.state !== 'running') return Promise.resolve();

  const duree = Math.max(0.03, dureeMs / 1000);
  const gainCible = Math.min(0.8, 10 ** (niveauDb / 20));
  const depart = ctx.currentTime + 0.02;
  const fin = depart + duree;

  const oscillateur = ctx.createOscillator();
  oscillateur.type = 'sine';
  oscillateur.frequency.value = frequenceHz;

  const gain = ctx.createGain();
  // Fondus en entrée et en sortie : une rampe linéaire depuis exactement zéro,
  // car une rampe exponentielle ne peut pas partir de zéro.
  gain.gain.setValueAtTime(0.0001, depart);
  gain.gain.linearRampToValueAtTime(gainCible, depart + FONDU);
  gain.gain.setValueAtTime(gainCible, Math.max(depart + FONDU, fin - FONDU));
  gain.gain.linearRampToValueAtTime(0.0001, fin);

  oscillateur.connect(gain).connect(ctx.destination);
  oscillateur.start(depart);
  oscillateur.stop(fin + 0.02);

  return new Promise((resoudre) => {
    oscillateur.onended = () => {
      oscillateur.disconnect();
      gain.disconnect();
      resoudre();
    };
  });
}

/** Un court silence, pour séparer deux stimuli sonores. */
export function silence(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}
