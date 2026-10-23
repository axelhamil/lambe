# Lambë privacy policy

[English](#english) · [Français](#français)

Last updated: October 23, 2026.

## English

Lambë is a Chrome extension that translates the web page or YouTube video you are viewing with a language model you configure. This policy describes every piece of data the extension handles.

### Data processed

- Page text: the text of the pages you ask Lambë to translate, either with a click or because you turned on automatic translation for that site. Code blocks, form fields and text marked not to translate are left out.
- YouTube captions: the captions of the videos you translate, read from the player.
- Context sent with that text, so the model picks the right terms: the site name, the page title, its meta description and headings; for YouTube, the video title, channel and description, and the previous caption lines.

This text is sent only to the provider you configured, to get the translation back. Nothing is sent before you accept the data disclosure in the onboarding screen.

### Data stored on your device

Lambë stores, in the extension storage of your browser (`chrome.storage.local`, never synced to your Google account):

- Settings: provider kind, address and model, target language and recent languages, site rules, YouTube switch, prompt guidelines, debug switch and the date you gave your consent.
- Translation cache: past translations, keyed by a hash of the source text, so pages and captions you revisit are shown at once.
- Optional API key: the key of an OpenAI-compatible provider, if you enter one. It is sent only to that provider, in the `Authorization` header, and never written to a log or an error message.

### Where data goes

- To the provider you configured, and nowhere else. By default this is Ollama on your own computer (`http://localhost:11434`), so the text never leaves your machine. If you enter a remote OpenAI-compatible server, its own privacy policy applies to what it receives.
- The settings page also contacts that provider to test the connection and list its models.
- Nothing is sent to the developer. Lambë has no server, no analytics, no ads, no tracking and no telemetry.
- No remote code: every script ships in the extension package.

### Permissions

Lambë reads a site only after you click the toolbar icon or press the shortcut on it (temporary access to that tab), or after you grant access to that site for a feature you turned on. You can revoke site access at any time in `chrome://extensions`.

### Deletion

- Clear the translation cache in the Cache section of the settings.
- Remove the API key in the Provider section.
- Withdraw your consent in the Privacy and about section: no text is sent until you accept again.
- Uninstall the extension to delete all its data from your browser.

### Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

### Changes and contact

Changes to this policy are published in this file, with a new date. For any question, open an issue at [github.com/axelhamil/lambe/issues](https://github.com/axelhamil/lambe/issues).

## Français

Lambë est une extension Chrome qui traduit la page web ou la vidéo YouTube que vous consultez avec un modèle de langage que vous configurez. Ces règles décrivent toutes les données que l'extension manipule.

### Données traitées

- Texte des pages : le texte des pages que vous demandez à Lambë de traduire, d'un clic ou parce que vous avez activé la traduction automatique de ce site. Les blocs de code, les champs de formulaire et le texte marqué à ne pas traduire sont exclus.
- Sous-titres YouTube : les sous-titres des vidéos que vous traduisez, lus dans le lecteur.
- Contexte joint à ce texte, pour que le modèle choisisse les bons termes : le nom du site, le titre de la page, sa description et ses intertitres ; pour YouTube, le titre, la chaîne et la description de la vidéo, ainsi que les sous-titres précédents.

Ce texte est envoyé uniquement au fournisseur que vous avez configuré, pour recevoir la traduction. Rien n'est envoyé avant que vous acceptiez la déclaration sur les données de l'écran d'accueil.

### Données stockées sur votre appareil

Lambë stocke, dans l'espace de stockage de l'extension de votre navigateur (`chrome.storage.local`, jamais synchronisé avec votre compte Google) :

- Réglages : type, adresse et modèle du fournisseur, langue cible et langues récentes, règles par site, interrupteur YouTube, consignes du prompt, interrupteur de débogage et date de votre consentement.
- Cache des traductions : les traductions déjà faites, indexées par une empreinte du texte source, pour afficher aussitôt les pages et les sous-titres que vous revoyez.
- Clé d'API facultative : la clé d'un fournisseur compatible OpenAI, si vous en saisissez une. Elle est envoyée uniquement à ce fournisseur, dans l'en-tête `Authorization`, et n'apparaît jamais dans un journal ni dans un message d'erreur.

### Destination des données

- Le fournisseur que vous avez configuré, et aucun autre. Par défaut, c'est Ollama sur votre propre ordinateur (`http://localhost:11434`) : le texte ne quitte pas votre machine. Si vous indiquez un serveur distant compatible OpenAI, ses propres règles de confidentialité s'appliquent à ce qu'il reçoit.
- La page des réglages contacte aussi ce fournisseur pour tester la connexion et lister ses modèles.
- Rien n'est envoyé au développeur. Lambë n'a ni serveur, ni statistiques d'usage, ni publicité, ni pistage, ni télémétrie.
- Aucun code distant : tous les scripts sont livrés dans le paquet de l'extension.

### Autorisations

Lambë ne lit un site qu'après un clic sur son icône ou l'appui sur le raccourci sur ce site (accès temporaire à cet onglet), ou après que vous avez autorisé ce site pour une fonction que vous avez activée. Vous pouvez retirer l'accès à un site à tout moment dans `chrome://extensions`.

### Suppression

- Videz le cache des traductions dans la section Cache des réglages.
- Supprimez la clé d'API dans la section Fournisseur.
- Retirez votre consentement dans la section Confidentialité et à propos : aucun texte n'est envoyé tant que vous ne l'acceptez pas de nouveau.
- Désinstallez l'extension pour effacer toutes ses données de votre navigateur.

### Utilisation limitée

L'utilisation des informations reçues des API Google respectera le Règlement sur les données utilisateur du Chrome Web Store, y compris les exigences d'utilisation limitée.

### Modifications et contact

Toute modification de ces règles est publiée dans ce fichier, avec une nouvelle date. Pour toute question, ouvrez un ticket sur [github.com/axelhamil/lambe/issues](https://github.com/axelhamil/lambe/issues).
