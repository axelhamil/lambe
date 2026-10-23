# Lambë

[English](README.md)

Une extension Chrome qui traduit les pages web et les sous-titres YouTube sur place, avec le modèle de votre choix : Ollama sur votre ordinateur par défaut, ou n'importe quel serveur compatible OpenAI. Elle laisse le code intact, garde le jargon métier tel que les professionnels l'écrivent et rétablit l'original instantanément.

Lambë signifie « langue » en quenya ; le glyphe de la bulle est le tengwa du même nom.

## Prérequis

- Chrome 130 ou plus récent (ou un navigateur Chromium de même base) en Manifest V3.
- Node 24.20 ou plus récent (`.nvmrc`), pnpm 11 (`packageManager`), Bun 1.4.0 pour les tests et les scripts (`.bun-version`, lu aussi par la CI).
- Un serveur de modèles. Par défaut, [Ollama](https://ollama.com) sur `http://localhost:11434` avec `ollama pull translategemma:12b`.
- Débutant avec les modèles locaux ? Suivez le [guide pour faire tourner une IA locale](docs/local-ai.fr.md) : matériel, installation, modèle et réglages.

## Installer et compiler

```sh
pnpm install
pnpm --filter @lambe/extension build
```

Pour la charger : ouvrez `chrome://extensions`, activez le mode développeur, cliquez sur **Charger l'extension non empaquetée** et choisissez `apps/extension/.output/chrome-mv3`.

## Premier lancement

La page des réglages s'ouvre à l'installation sur un écran d'accueil. Il explique ce qui sort du navigateur (le texte des pages et les sous-titres que vous traduisez, envoyés uniquement au fournisseur que vous configurez) et demande votre consentement. Tant que vous n'avez pas accepté, Lambë n'envoie rien : l'icône de la barre d'outils, `Alt+L` et la bulle ouvrent les réglages. Vous pouvez retirer votre consentement à tout moment dans **Confidentialité et à propos**.

## Utilisation

- Icône de la barre d'outils ou `Alt+L` : traduit la page courante, puis bascule entre la traduction et l'original.
- Clic sur la bulle : traduit la partie visible de la page, puis ce que vous faites défiler.
- Nouveau clic : retour à l'original, depuis la mémoire, sans requête. Encore un : la traduction revient, sans requête.
- Double clic : traduit de nouveau en ignorant le cache, qui est réécrit.
- Glisser la bulle : elle se colle au bord le plus proche et sa pointe se retourne.
- Clic droit sur la bulle : traduire cette page dans une autre langue, traduire ce site automatiquement, masquer la bulle sur ce site ou ouvrir les réglages.

## Réglages

| Section | Ce que vous réglez |
| --- | --- |
| Fournisseur | Ollama ou compatible OpenAI, URL de base, modèle (choisi dans la liste du serveur), clé d'API pour le compatible OpenAI, et un test de connexion qui explique chaque échec |
| Traduction | La langue cible, par défaut celle du navigateur |
| Sites | La bulle sur tous les sites, et des règles par site : traduction automatique, bulle masquée |
| YouTube | Les sous-titres traduits dans le lecteur |
| Prompt | Les consignes que suit le modèle ; les modifier repart d'un cache neuf pour ce texte, la réinitialisation rétablit celles par défaut |
| Cache | La taille des traductions gardées sur l'appareil, et un bouton pour le vider |
| Raccourci | La touche actuelle de la commande de bascule (`Alt+L` par défaut) et un lien pour la changer |
| Confidentialité et à propos | Ce qui est envoyé et où, le consentement, la version, les règles de confidentialité |

Les réglages sont dans `chrome.storage.local` sous `lambe:settings` ; la clé d'API est rangée à part sous `lambe:secrets` et n'apparaît jamais dans les journaux. Si les réglages enregistrés sont invalides ou viennent d'une version plus récente, Lambë tourne avec les valeurs par défaut, n'y touche pas et affiche un bandeau pour les réinitialiser ou les corriger.

## Fournisseurs

- **Ollama** (par défaut) : `http://localhost:11434`, modèles lus depuis `/api/tags`. Voir [Autoriser l'extension dans Ollama](#autoriser-lextension-dans-ollama).
- **Compatible OpenAI** : tout serveur qui parle `POST /v1/chat/completions` en streaming et `GET /v1/models` (LM Studio, vLLM, serveur llama.cpp, API hébergées). Saisissez l'URL de base avec ou sans `/v1`, et la clé d'API si le serveur en demande une. Enregistrer une URL de base hors de `localhost` demande à Chrome l'accès à cette seule origine.

Les requêtes vers le fournisseur partent du service worker ou de la page des réglages, jamais d'un script de contenu.

## Autorisations

Lambë demande le strict nécessaire et réclame le reste au moment où vous activez une fonction.

| Autorisation | Pourquoi |
| --- | --- |
| `storage`, `unlimitedStorage` | Les réglages, la clé d'API facultative et le cache des traductions, sur l'appareil uniquement |
| `activeTab`, `scripting` | Injecter le script de page dans l'onglet courant quand vous cliquez sur l'icône ou appuyez sur `Alt+L` |
| `http://localhost/*`, `http://127.0.0.1/*` | Joindre Ollama sur votre ordinateur, sur n'importe quel port |
| `https://*/*`, `http://*/*` (facultatives) | Demandées au moment du clic pour ce que vous choisissez : la bulle partout, un site traduit automatiquement, les sous-titres YouTube, un fournisseur distant |

Le manifeste ne déclare aucun script de contenu. La bulle partout, la traduction automatique d'un site et les sous-titres YouTube enregistrent leurs scripts à l'exécution, une fois l'origine accordée. Retirer une origine dans `chrome://extensions` supprime ses scripts et désactive le réglage.

## Langues

L'interface suit la langue du navigateur, français ou anglais (`apps/extension/locales`). Une chaîne française manquante retombe sur l'anglais, et un test échoue dès que les deux catalogues divergent.

## Identifiant de l'extension

Le manifeste porte une `key` publique fixe (dans `apps/extension/wxt.config.ts`) : l'identifiant de la version non empaquetée est le même sur toutes les machines, `dccgcoohbalgmgkflpndagoallbcgnch`. Pour le retrouver depuis une compilation :

```sh
jq -r .key apps/extension/.output/chrome-mv3/manifest.json | base64 -d | sha256sum | head -c32 | tr 0-9a-f a-p
```

La clé privée n'est jamais versionnée. La version du store n'a pas de `key` : le Chrome Web Store attribue son propre identifiant.

## Autoriser l'extension dans Ollama

Ollama répond 403 aux origines qu'il ne connaît pas. La bulle passe alors au rouge, et le test de connexion des réglages affiche la correction pour Linux, macOS et Windows avec l'identifiant de l'extension en cours. Sous Linux, lancez `sudo systemctl edit ollama`, puis ajoutez :

```ini
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Enregistrez, puis lancez `sudo systemctl restart ollama`. Avec la version du store, utilisez son identifiant à la place.

## Facultatif : requêtes en parallèle

Rien d'autre n'est requis. Lambë garde une requête en attente derrière celle qui arrive, pour que le GPU n'attende jamais, et demande à Ollama de garder le modèle chargé 10 minutes (`keep_alive`). Si vous ajoutez aussi `Environment="OLLAMA_NUM_PARALLEL=4"` dans le même bloc `[Service]`, Lambë voit les réponses arriver en parallèle, monte jusqu'à 8 requêtes simultanées et répartit l'écran visible entre elles. Sans ce réglage, Lambë reste à 1 requête à la fois.

## Sous-titres YouTube

Activez d'abord **YouTube** dans les réglages : Chrome demande l'accès à `https://www.youtube.com/*`. Sur une page de vidéo, Lambë ajoute alors un bouton aux commandes du lecteur, à gauche du bouton des sous-titres. Un clic affiche les sous-titres traduits dans la langue cible, avec le style de ceux de YouTube ; les sous-titres natifs sont masqués, et activés s'ils étaient coupés. Un nouveau clic rétablit les sous-titres natifs tels que vous les aviez, sans requête ; encore un et la traduction revient, sans requête non plus. Couper les sous-titres dans le lecteur coupe aussi Lambë. Lambë lit la piste que le lecteur charge lui-même et ne demande au modèle que quelques phrases d'avance sur la tête de lecture : l'avance rapide et la navigation dans YouTube marchent sans rechargement. Une piste déjà dans la langue cible s'affiche telle quelle, sans requête.

## Scripts

| Commande | Rôle |
| --- | --- |
| `pnpm verify` | Biome, vérification des types, tests, knip, jscpd, dependency-cruiser |
| `pnpm test` | Tests Bun de chaque workspace |
| `pnpm fix` | Biome avec corrections |
| `pnpm zip` | Zip pour le store dans `apps/extension/.output/*-chrome-store.zip`, compilé avec `LAMBE_STORE=1` (sans `key`) |
| `pnpm --filter @lambe/extension build` | Compilation de production dans `apps/extension/.output/chrome-mv3` |
| `pnpm --filter @lambe/extension dev` | Mode développement WXT |
| `bun apps/extension/scripts/render-promo.ts` | Génère la vignette promotionnelle 440x280 avec Brave headless (`BRAVE_PATH` pour un autre Chromium) |

## Chrome Web Store

- Texte de la fiche, objectif unique, justification des autorisations et déclarations sur les données : [`docs/store/listing.fr.md`](docs/store/listing.fr.md) et [`docs/store/listing.en.md`](docs/store/listing.en.md). Un test vérifie que les descriptions courtes tiennent en 132 caractères et que chaque autorisation du manifeste est justifiée, sans en ajouter.
- Vignette promotionnelle : `docs/store/assets/promo-440x280.png`.
- Règles de confidentialité : [`docs/privacy-policy.md`](docs/privacy-policy.md). La fiche et les réglages pointent vers ce fichier sur GitHub : le dépôt doit être public avant l'envoi au store ; c'est la seule étape manuelle.
- Version du store : `pnpm zip`, puis `LAMBE_STORE=1 pnpm --filter @lambe/extension check:manifest` pour vérifier qu'elle n'a ni `key` ni script de contenu statique, et exactement les autorisations prévues.

La publication automatique, les secrets du dépôt et les mesures de vérification sont décrits dans le [README anglais](README.md#release).

## Licence

[MIT](LICENSE).
