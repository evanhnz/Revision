/**
 * Lecteur de fiche audio.
 *
 * Le fichier MP3 est publié chiffré, comme le reste du contenu. Il n'est
 * récupéré et déchiffré qu'au moment où on demande à l'écouter : une fiche
 * audio pèse quelques mégaoctets, les charger à l'ouverture de chaque page
 * alourdirait la navigation pour rien.
 *
 * Le son déchiffré ne quitte jamais la mémoire de l'onglet : il devient un
 * Blob, dont l'URL locale alimente un lecteur HTML natif.
 */
import { chargerBinaire, type Fiche } from './contenu';

/** Position de lecture mémorisée, par fiche. */
const CLE_POSITION = 'revinsp.podcast.position';

/** Une seule URL d'objet vivante à la fois : les libérer évite de retenir le son. */
let urlCourante: string | null = null;

function liberer() {
  if (urlCourante) {
    URL.revokeObjectURL(urlCourante);
    urlCourante = null;
  }
}

function lirePositions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(CLE_POSITION) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function ecrirePosition(id: string, secondes: number) {
  try {
    const positions = lirePositions();
    if (secondes < 15) delete positions[id];
    else positions[id] = Math.floor(secondes);
    localStorage.setItem(CLE_POSITION, JSON.stringify(positions));
  } catch {
    /* navigation privée */
  }
}

/** « 12 min · 1,5 Mo », pour annoncer le téléchargement avant de le lancer. */
function calibre(podcast: { secondes: number | null; octets: number }): string {
  const poids = `${(podcast.octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  if (!podcast.secondes) return poids;
  const minutes = Math.max(1, Math.round(podcast.secondes / 60));
  return `${minutes} min · ${poids}`;
}

/**
 * Installe le lecteur dans la page d'une fiche.
 * Sans fiche audio, la section indique que le podcast n'existe pas encore —
 * plutôt qu'un lecteur vide qui semblerait cassé.
 */
export function installerLecteurPodcast(fiche: Fiche): void {
  const section = document.getElementById('podcast');
  const bouton = document.getElementById('podcast-bouton') as HTMLButtonElement | null;
  const info = document.getElementById('podcast-info');
  const lecteur = document.getElementById('podcast-lecteur') as HTMLAudioElement | null;
  if (!section || !bouton || !info || !lecteur) return;

  liberer();
  section.classList.remove('hidden');

  if (!fiche.podcast) {
    bouton.classList.add('hidden');
    info.textContent = 'Fiche audio pas encore disponible pour cette fiche.';
    return;
  }

  // Le format publié est choisi au build : si ce navigateur ne sait pas le
  // lire, mieux vaut le dire que de laisser un bouton qui ne fera rien.
  if (lecteur.canPlayType(fiche.podcast.type) === '') {
    bouton.classList.add('hidden');
    info.textContent =
      'Ce navigateur ne sait pas lire le format audio publié. ' +
      'Republiez le site avec « format: \'mp3\' » dans site.config.mjs.';
    return;
  }

  const reprise = lirePositions()[fiche.id] ?? 0;
  info.textContent = calibre(fiche.podcast);
  bouton.textContent = reprise ? '▶ Reprendre l’écoute' : '▶ Écouter la fiche';

  bouton.addEventListener('click', async () => {
    bouton.disabled = true;
    bouton.textContent = 'Déchiffrement…';
    try {
      const octets = await chargerBinaire(`audio/${fiche.id}.enc`);
      liberer();
      urlCourante = URL.createObjectURL(new Blob([octets], { type: fiche.podcast!.type }));
      lecteur.src = urlCourante;
      lecteur.classList.remove('hidden');
      bouton.classList.add('hidden');
      if (reprise) lecteur.currentTime = reprise;
      void lecteur.play().catch(() => {
        /* le navigateur peut refuser la lecture automatique : les commandes sont là */
      });
    } catch (erreur) {
      bouton.disabled = false;
      bouton.textContent = '▶ Écouter la fiche';
      info.textContent = erreur instanceof Error ? erreur.message : 'Lecture impossible.';
    }
  });

  // La position n'est écrite qu'au fil de l'eau : pas besoin d'une précision
  // à la seconde, et cela évite d'écrire à chaque image.
  lecteur.addEventListener('timeupdate', () => {
    if (Math.floor(lecteur.currentTime) % 5 === 0) ecrirePosition(fiche.id, lecteur.currentTime);
  });
  lecteur.addEventListener('ended', () => ecrirePosition(fiche.id, 0));
  window.addEventListener('pagehide', liberer, { once: true });
}
