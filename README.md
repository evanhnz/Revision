# Révisions de droit

Espace de révision personnel, chiffré, hébergé gratuitement sur GitHub Pages :
cours, fiches simplifiées, flashcards à répétition espacée (FSRS), quiz,
prétests, glossaire, planning, statistiques et exercices cognitifs, avec un
**éditeur de fiches intégré**.

Tout le contenu est chiffré (AES-256-GCM, clé dérivée du mot de passe par
PBKDF2, 600 000 itérations) : le dépôt public et le site publié ne contiennent
aucune fiche lisible, pas même un titre.

---

## Au quotidien

Tout se fait depuis le site, onglet **Éditeur** :

- créer, modifier, déplacer ou supprimer une fiche ;
- gérer l'arborescence : matières, catégories et sous-catégories, de
  profondeur libre ;
- tenir le glossaire ;
- **importer** des fiches au format standard : fichiers `.md` déposés, ou texte
  collé (une ou plusieurs fiches à la suite) ;
- **exporter** une fiche en `.md`, ou toutes les fiches dans une archive `.zip`.

Chaque enregistrement crée un commit dans le dépôt (fiche chiffrée dans le
navigateur), puis le site se republie automatiquement en une à trois minutes.

### Faire rédiger des fiches par un assistant

Éditeur → Importer → **Copier la notice** : la notice de format
(`NOTICE-FORMAT.md`) est copiée avec l'arborescence actuelle. Collez-la dans une
conversation avec votre cours, puis collez la réponse dans l'import. Chaque
fiche est contrôlée avant d'être ajoutée.

### Sur téléphone

Le site s'adapte aux petits écrans ; les onglets passent dans un menu ☰.
Pour l'installer comme une application (icône sur l'écran d'accueil,
ouverture en plein écran) :

- **iPhone** (Safari) : bouton Partager → « Sur l'écran d'accueil » ;
- **Android** (Chrome) : menu ⋮ → « Installer l'application » ou « Ajouter à
  l'écran d'accueil ».

---

## Le format d'une fiche

Un fichier Markdown : un en-tête, puis cinq sections facultatives. La notice
complète est dans [`NOTICE-FORMAT.md`](NOTICE-FORMAT.md).

```markdown
---
titre: "Le dol"
chemin: ["Droit des obligations", "Le contrat", "La formation du contrat"]
ordre: 2
tags: ["dol"]
---

## Prétest        (3 à 16 QCM posés avant la première lecture)
## Cours complet  (Markdown, sous-titres en ###)
## Fiche simplifiée
## Flashcards     (- q: "…" / r: "…")
## Quiz           (question, options, reponse, explication)
```

L'ancien format à deux niveaux (`matiere:` et `fascicule:`) reste lu.

Fichiers gérés, relatifs à `content/` :

| Fichier | Rôle |
|---|---|
| `fiches/*.md` | les fiches (noms opaques, attribués par l'éditeur) |
| `categories.yml` | ordre de l'arborescence et catégories encore vides |
| `glossaire.yml` | termes soulignés automatiquement dans les cours |

---

## Mise en ligne (une seule fois)

1. **Créer le dépôt** sur GitHub et y pousser ce projet (le dépôt doit être
   public pour GitHub Pages en compte gratuit ; c'est sans risque, tout y est
   chiffré).
2. **Choisir le mot de passe** : Settings → Secrets and variables → Actions →
   *New repository secret*, nom `SITE_PASSWORD`. Il n'est écrit nulle part
   ailleurs.
3. **Activer Pages** : Settings → Pages → Source : **GitHub Actions**.
4. Lancer une première publication : onglet Actions → *Publier le site* →
   *Run workflow*.
5. Sur le site, onglet **Éditeur** : créer un jeton d'accès GitHub et le
   coller (la marche à suivre s'affiche). À refaire sur chaque appareil.

L'adresse du site est `https://<compte>.github.io/<dépôt>/`, ou
`https://<compte>.github.io/` pour un dépôt nommé `<compte>.github.io`. Le
chemin est déduit automatiquement.

**Changer de mot de passe** n'est pas une simple modification du secret : les
fiches du dépôt sont chiffrées avec l'ancien. Il faut les récupérer en local
(`npm run sources:recuperer` avec l'ancien), changer le secret, puis les
rechiffrer (`npm run sources:envoyer` avec le nouveau) et pousser.

---

## Travailler en local (facultatif)

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
echo "SITE_PASSWORD=votre-mot-de-passe" > .env.local   # jamais commité
npm run sources:recuperer   # déchiffre les fiches du dépôt dans content/
npm run dev                 # site local ; l'éditeur écrit alors dans content/
npm run sources:envoyer     # rechiffre content/ dans sources/, à committer
```

`content/` (fiches en clair) et `.env.local` sont exclus de Git.

---

## Comment fonctionne la protection

- **Le site publié** : chaque fiche, l'arborescence, le glossaire et l'index de
  recherche sont chiffrés au build. Le navigateur redérive la clé à partir du
  mot de passe et déchiffre en mémoire.
- **Le dépôt** : les fiches sont dans `sources/`, chiffrées avec la même clé ;
  les messages de commit sont neutres (« Modifie une fiche »).
- **Le sel** (`sel.json`) est public et stable : un sel n'est pas un secret, et
  sa stabilité évite de ressaisir le mot de passe après chaque publication.
- **Le jeton GitHub** de l'éditeur est conservé dans le navigateur, chiffré avec
  la clé de la session. Utilisez un jeton *fine-grained* limité à ce seul dépôt
  (Contents : lecture et écriture ; Actions : lecture).
- `robots.txt` et les balises `noindex` écartent les moteurs de recherche.

Limites : qui obtient le mot de passe obtient tout. L'option « rester
connecté » garde la clé dans le navigateur : décochez-la sur un appareil
partagé, ou utilisez le cadenas 🔒.

---

## Fiches audio

Le site sait lire une version parlée de chaque cours, produite **en local** par
synthèse vocale (Kokoro ou Piper, gratuits) : `npm run podcasts:installer` puis
`npm run podcasts`. La publication automatique ne les produit pas (le modèle de
voix pèse plusieurs centaines de Mo) : les fiches affichent « Fiche audio pas
encore disponible ».

---

## Vérifications

```bash
npm run verifier            # contrôle des types
npm run essais:srs          # répétition espacée
npm run essais:niveau       # estimation de niveau
npm run essais:relationnel  # Relational Reasoning (quelques minutes)
npm run essais:veridical    # Veridical Mapping
```

---

## Origine et licences

Application dérivée, avec l'accord de son auteur, de l'espace de révision de
RisitasLeGrand (`risitaslegrand.github.io`) : le contenu du concours, le QCM
DGFiP et la rubrique d'actualités ont été retirés ; l'arborescence libre,
l'éditeur, l'import et l'export, les sources chiffrées et la publication
automatique ont été ajoutés.

Le Quad N-Back reprend du code du projet **quad-box** (licence MIT, voir
`src/features/quad-n-back/LICENCE-quad-box.txt`). Polices Public Sans et
Spectral sous licence SIL Open Font License.
