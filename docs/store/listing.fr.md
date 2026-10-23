# Fiche Chrome Web Store (français)

Texte à coller dans le tableau de bord développeur. Chaque section `##` correspond à un champ du tableau de bord. L'URL des règles de confidentialité pointe vers `docs/privacy-policy.md` sur GitHub ; elle répond dès que le dépôt est public.

## Nom

Lambë

## Description courte

Traduisez pages web et sous-titres YouTube sur place avec votre modèle : Ollama en local ou un serveur compatible OpenAI.

## Description détaillée

Lambë traduit la page que vous lisez sans la quitter. Le texte est remplacé sur place, les blocs de code restent intacts et les termes techniques restent tels que les professionnels les écrivent. Un clic rétablit aussitôt l'original, depuis la mémoire.

Lambë utilise le modèle de votre choix. Par défaut, il s'adresse à Ollama sur votre ordinateur : le texte ne quitte jamais votre machine. Vous pouvez aussi le brancher sur n'importe quel serveur compatible OpenAI avec une clé d'API.

Ce qu'il fait :

- Traduit d'abord la partie visible de la page, puis ce que vous faites défiler.
- Bascule entre la traduction et l'original d'un clic sur la languette, sur l'icône de la barre d'outils ou avec Alt+L, sans nouvelle requête.
- Un double clic sur la languette relance la traduction et rafraîchit le cache.
- Traduit les sous-titres YouTube dans le lecteur, quelques phrases avant la tête de lecture, avec le style des sous-titres natifs.
- Garde les traductions sur votre appareil : les pages déjà vues s'ouvrent aussitôt.

Réglages :

- Fournisseur : Ollama ou un serveur compatible OpenAI, choix du modèle et test de connexion.
- Traduction : la langue dans laquelle vous lisez.
- Sites : afficher la languette sur tous les sites, traduire certains sites automatiquement et masquer la languette sur d'autres.
- YouTube : activer ou couper les sous-titres traduits.
- Prompt : modifier les consignes que suit le modèle.
- Cache : voir sa taille et le vider.
- Raccourci : voir et changer la touche Alt+L.
- Confidentialité : savoir ce qui sort du navigateur et retirer votre consentement.

La confidentialité d'abord : Lambë demande votre consentement avant d'envoyer le moindre texte. Le texte des pages et les sous-titres partent uniquement vers le fournisseur que vous configurez. Rien ne part vers le développeur, aucune statistique d'usage, aucun code distant. Lambë ne demande l'accès à un site qu'au moment où vous activez une fonction qui en a besoin.

L'interface existe en français et en anglais.

## Catégorie

Outils

## Langue

Français

## Objectif unique

Lambë traduit sur place le texte de la page web ou de la vidéo YouTube que l'utilisateur consulte, avec un modèle de langue qu'il configure, et rétablit l'original à la demande.

## Justification des autorisations

### `storage`

Enregistre les réglages de l'utilisateur (fournisseur, langue cible, règles par site, consignes du prompt, date du consentement) et la clé d'API facultative du fournisseur, sur l'appareil uniquement.

### `unlimitedStorage`

Garde le cache des traductions sur l'appareil pour que les pages et les sous-titres déjà vus s'affichent aussitôt, sans nouvelle requête. Sur de longues pages, le cache peut dépasser le quota par défaut ; l'utilisateur voit sa taille et peut le vider dans les réglages.

### `activeTab`

Quand l'utilisateur clique sur l'icône de la barre d'outils ou appuie sur Alt+L, donne un accès temporaire à l'onglet courant uniquement, pour que Lambë traduise cette page sans autorisation permanente sur le site.

### `scripting`

Injecte le script de traduction dans l'onglet courant après ce clic, et l'enregistre sur les sites que l'utilisateur a explicitement autorisés (languette sur tous les sites, traduction automatique d'un site, sous-titres YouTube).

### `http://localhost/*`

Joint Ollama, le fournisseur par défaut, qui tourne sur l'ordinateur de l'utilisateur, sur n'importe quel port de localhost.

### `http://127.0.0.1/*`

Comme localhost, pour les utilisateurs dont l'adresse d'Ollama s'écrit 127.0.0.1.

### `https://*/*`

Facultative, demandée uniquement au moment du clic. Les origines accordées sont les sites que l'utilisateur choisit dans les réglages (languette partout, site traduit automatiquement, YouTube) et l'adresse d'un fournisseur distant compatible OpenAI qu'il saisit. Rien n'est demandé à l'installation.

### `http://*/*`

Facultative, demandée uniquement au moment du clic, pour les mêmes choix sur des sites ou des fournisseurs servis en http simple, comme un serveur de modèles sur le réseau local.

## Code distant

Non, je n'utilise pas de code distant. Tous les scripts sont dans le paquet.

## Utilisation des données

Types de données à cocher dans le tableau de bord :

- Contenu de site web : le texte des pages que l'utilisateur demande de traduire et les sous-titres des vidéos YouTube qu'il traduit, avec le titre, la description et les intertitres de la page ou de la vidéo comme contexte. Envoyés uniquement au fournisseur qu'il a configuré, pour recevoir la traduction.
- Informations d'authentification : la clé d'API facultative d'un fournisseur compatible OpenAI. Stockée sur l'appareil et envoyée uniquement à ce fournisseur, dans l'en-tête `Authorization`.

Aucun autre type n'est collecté. Les réglages et le cache des traductions restent sur l'appareil. Rien n'est envoyé au développeur : aucune statistique d'usage, aucune publicité, aucun pistage. Avant la première traduction, un écran d'accueil explique ce qui est envoyé et où, puis demande le consentement ; l'utilisateur peut le retirer à tout moment dans les réglages.

Certifications à cocher :

- Je ne vends ni ne transfère les données des utilisateurs à des tiers, en dehors des cas d'usage approuvés.
- Je n'utilise ni ne transfère les données des utilisateurs à des fins sans rapport avec l'objectif unique de l'article.
- Je n'utilise ni ne transfère les données des utilisateurs pour évaluer leur solvabilité ou accorder des prêts.

L'utilisation des informations reçues des API Google respectera le Règlement sur les données utilisateur du Chrome Web Store, y compris les exigences d'utilisation limitée.

## URL des règles de confidentialité

https://github.com/axelhamil/lambe/blob/main/docs/privacy-policy.md

Étape manuelle : rendre le dépôt public pour que cette URL réponde, puis la coller dans le tableau de bord.

## Visuels

- Icône de la fiche : `apps/extension/public/icon/128.png` (128x128).
- Petite vignette promotionnelle : `docs/store/assets/promo-440x280.png` (440x280), générée par `bun apps/extension/scripts/render-promo.ts`.
- Captures d'écran : 1280x800, à prendre sur une vraie session (page des réglages, page traduite, sous-titres YouTube).
