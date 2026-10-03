# Format des fiches de révision

Rédige les fiches demandées au format ci-dessous, **exactement**, pour qu'elles s'importent sans retouche dans mon application de révision. Une fiche par notion (un thème, un arrêt, un mécanisme). Plusieurs fiches peuvent se suivre dans la même réponse : chacune commence par son propre en-tête.

## Structure d'une fiche

```markdown
---
titre: "Les vices du consentement"
chemin: ["Droit des obligations", "Le contrat", "La formation du contrat"]
ordre: 3
tags: ["erreur", "dol", "violence"]
---

## Prétest

- question: "Le silence d'un contractant peut-il constituer un dol ?"
  options: ["Oui", "Non"]
  reponse: "Oui"
- question: "Quel article du Code civil définit le dol ?"
  options: ["1130", "1137", "1240"]
  reponse: "1137"
- question: "Une erreur sur la valeur est-elle en principe une cause de nullité ?"
  options: ["Oui", "Non"]
  reponse: "Non"

## Cours complet

### I. L'erreur

Texte du cours, en Markdown : paragraphes, **gras**, *italique*, listes, tableaux.

### II. Le dol

…

## Fiche simplifiée

- **Texte** : art. 1130 à 1144 C. civ.
- **Idée clé** : …

## Flashcards

- q: "Quel article définit le dol ?"
  r: "L'article 1137 du Code civil."
- q: "Quelle est la sanction des vices du consentement ?"
  r: "La nullité relative (art. 1131 C. civ.)."

## Quiz

- question: "Le dol est sanctionné par :"
  options:
    - "La nullité relative"
    - "La nullité absolue"
    - "L'inexistence"
  reponse: "La nullité relative"
  explication: "Article 1131 du Code civil."
```

## Règles

**En-tête** (entre les deux lignes `---`) :
- `titre` : obligatoire.
- `chemin` : obligatoire. La catégorie, de la matière à la sous-catégorie la plus précise, entre crochets. Reprends **exactement** les noms de catégories existants indiqués plus bas ; une catégorie inconnue est créée automatiquement.
- `ordre` : facultatif. Position de la fiche dans sa catégorie (1, 2, 3…).
- `tags` : facultatif. Mots-clés.

**Sections** : toutes facultatives, avec ces titres exacts, précédés de `## ` : `Prétest`, `Cours complet`, `Fiche simplifiée`, `Flashcards`, `Quiz`.
- Dans `Cours complet` et `Fiche simplifiée`, les sous-titres s'écrivent avec `###` (jamais `##`, réservé aux sections).
- `Flashcards` : une liste de `- q: "…"` et `r: "…"`. Une carte = une question précise, une réponse courte. Pas de doublon.
- `Quiz` : une liste de `question`, `options` (au moins deux), `reponse` (le texte exact d'une des options) et `explication` (facultative). Pour plusieurs bonnes réponses : `reponses: ["…", "…"]`.
- `Prétest` : même format que le quiz, **3 à 16 questions**, posées avant la lecture du cours. Ce sont des questions d'orientation, pas un contrôle ; ne recopie pas une question du quiz.

**Syntaxe** :
- Mets **toutes** les valeurs entre guillemets droits `"…"`. À l'intérieur, utilise des apostrophes `'` ou des guillemets français « » plutôt que des guillemets droits.
- Respecte l'indentation des listes (deux espaces avant `r:`, `options:`, `reponse:`).
- Ne mets pas la fiche dans un bloc de code, et n'ajoute rien entre deux fiches.

**Fond** :
- Cite la source de chaque règle : article (« art. 1137 C. civ. ») ou décision (juridiction, formation, date et numéro de pourvoi ou de requête).
- N'invente aucune référence. En cas de doute sur une date ou un numéro, écris-le en clair (« [référence à vérifier] ») plutôt que de deviner.
- Rédige avec tes propres mots à partir des sources ; ne recopie pas un manuel.
