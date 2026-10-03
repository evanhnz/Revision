/**
 * Ce qu'un prétest n'a pas le droit de demander.
 *
 * Un prétest ouvre la lecture d'un sujet ; il ne révise pas le mode d'emploi du
 * concours. Une question sur la durée de l'épreuve, son coefficient, le plan
 * attendu ou ce qu'en dit le jury n'oriente aucune lecture : elle occupe la
 * place d'une question qui, elle, l'aurait fait.
 *
 * Partagé par le build et par « npm run verifier:pretests », pour que les deux
 * disent la même chose.
 */

/**
 * La liste est volontairement étroite : chaque terme y figure parce qu'il ne
 * peut guère désigner autre chose que l'exercice du concours. « Programme »,
 * « rédaction », « candidat » et « note » en sont absents — ils servent aussi
 * au fond (programme de clémence, responsable de programme, candidat à un
 * emploi public, note souveraine), et un contrôle qui crie à tort finit par ne
 * plus être lu. C'est donc un filet, pas une preuve : la règle tient d'abord à
 * ce qu'on écrit.
 */
export const MOTS_DE_L_EPREUVE = [
  'epreuve',
  'epreuves',
  'copie',
  'copies',
  'correcteur',
  'correcteurs',
  'jury',
  'jurys',
  'coefficient',
  'note operationnelle',
  'note de synthese',
  'note administrative',
  'fascicule',
  'fascicules',
  'chapitre',
  'chapitres',
  'devoir',
  'corrige',
  'dissertation',
  'dissertations',
  'insp',
];

export const normaliserQuestion = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Le terme de l'épreuve trouvé dans une question, s'il y en a un. */
export function motDeLEpreuve(question) {
  const entier = normaliserQuestion(question);
  const mots = entier.split(' ');
  return (
    MOTS_DE_L_EPREUVE.find((m) => (m.includes(' ') ? entier.includes(m) : mots.includes(m))) ?? null
  );
}
