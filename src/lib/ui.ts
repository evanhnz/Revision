/** Petites fonctions utilitaires partagées par les pages. */

export const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const lien = (chemin: string) => `${base}${chemin}`;

export function echapper(texte: string): string {
  const d = document.createElement('div');
  d.textContent = texte;
  return d.innerHTML;
}

/** Retire les accents et met en minuscules (recherche insensible). */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function formaterDuree(secondes: number): string {
  if (secondes < 60) return `${Math.round(secondes)} s`;
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste ? `${heures} h ${String(reste).padStart(2, '0')}` : `${heures} h`;
}

export function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

/** Mélange un tableau (Fisher-Yates). */
export function melanger<T>(tableau: T[]): T[] {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

export function parametreUrl(nom: string): string | null {
  return new URLSearchParams(window.location.search).get(nom);
}

/** Affiche un message éphémère en bas de l'écran (gains d'XP, badges…). */
export function notifier(message: string, variante: 'info' | 'succes' | 'badge' = 'info') {
  let zone = document.getElementById('zone-notifications');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'zone-notifications';
    zone.className = 'pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4';
    zone.setAttribute('aria-live', 'polite');
    document.body.appendChild(zone);
  }
  const couleurs = {
    info: 'bg-slate-800 text-white',
    succes: 'bg-emerald-600 text-white',
    badge: 'bg-amber-500 text-white',
  }[variante];

  const bulle = document.createElement('div');
  bulle.className = `pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-all duration-300 ${couleurs}`;
  bulle.textContent = message;
  bulle.style.opacity = '0';
  bulle.style.transform = 'translateY(8px)';
  zone.appendChild(bulle);
  requestAnimationFrame(() => {
    bulle.style.opacity = '1';
    bulle.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    bulle.style.opacity = '0';
    bulle.style.transform = 'translateY(8px)';
    setTimeout(() => bulle.remove(), 320);
  }, 2600);
}
