/**
 * Lecture des sons du Quad N-Back.
 *
 * Remplace la dépendance « howler » utilisée par quad-box : le besoin réel se
 * limite au préchargement, au repli opus → mp3 et à une lecture non bloquante.
 * L'API Audio native suffit, ce qui évite une dépendance de plus dans un projet
 * destiné à être maintenu par une personne non-développeuse.
 */
import { AUDIO_POOL } from './constantes.js';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const dossier = `${base}/quad-n-back/audio`;

/** Choisit le format servi : opus si le navigateur le gère, sinon mp3. */
function extension() {
  const test = document.createElement('audio');
  return test.canPlayType('audio/ogg; codecs=opus') ? 'opus' : 'mp3';
}

class LecteurAudio {
  constructor() {
    this.cache = new Map();
    this.ext = null;
    this.actif = true;
  }

  url(lettre) {
    this.ext ??= extension();
    return `${dossier}/${lettre}.${this.ext}`;
  }

  /** Précharge tous les sons : évite tout blanc au premier stimulus. */
  precharger() {
    for (const lettre of AUDIO_POOL) {
      if (this.cache.has(lettre)) continue;
      const element = new Audio(this.url(lettre));
      element.preload = 'auto';
      this.cache.set(lettre, element);
    }
  }

  /**
   * Joue un son. N'attend pas la fin : la boucle de jeu doit rester à l'heure.
   * Un échec (autorisation de lecture refusée) est silencieux — la partie
   * continue, seule la dimension sonore devient inaudible.
   */
  jouer(lettre) {
    if (!this.actif || !lettre) return;
    let element = this.cache.get(lettre);
    if (!element) {
      element = new Audio(this.url(lettre));
      this.cache.set(lettre, element);
    }
    try {
      element.currentTime = 0;
      const promesse = element.play();
      if (promesse) promesse.catch(() => {});
    } catch {
      /* lecture impossible : on n'interrompt pas la partie */
    }
  }

  /**
   * Débloque la lecture audio.
   * Les navigateurs mobiles exigent qu'un premier son parte d'une interaction
   * utilisateur ; on le fait au clic sur « Commencer », en volume nul.
   */
  async debloquer() {
    const lettre = AUDIO_POOL[0];
    const element = this.cache.get(lettre) ?? new Audio(this.url(lettre));
    this.cache.set(lettre, element);
    const volume = element.volume;
    try {
      element.volume = 0;
      await element.play();
      element.pause();
      element.currentTime = 0;
    } catch {
      /* refusé : les sons suivants échoueront silencieusement */
    } finally {
      element.volume = volume;
    }
  }
}

export const lecteurAudio = new LecteurAudio();
