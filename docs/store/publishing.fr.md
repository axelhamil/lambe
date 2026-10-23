# Publier sur le Chrome Web Store

Chaque version publiée sur `main` est envoyée au Chrome Web Store par `.github/workflows/release.yml` et mise en ligne dès que l'examen est validé. Cette page décrit la configuration à faire une seule fois.

## 1. Premier envoi, à la main

L'API ne met à jour qu'un élément qui existe déjà : la première version passe donc par le [tableau de bord développeur](https://chrome.google.com/webstore/devconsole).

1. Téléchargez le fichier `*-chrome-store.zip` d'une release GitHub, ou générez-le avec `pnpm zip`.
2. Dans le tableau de bord, cliquez sur **New item** (nouvel élément) et envoyez le zip.
3. Remplissez les onglets **Store listing** et **Privacy** à partir de [`listing.fr.md`](listing.fr.md) et [`listing.en.md`](listing.en.md), avec la vignette de `assets/`.
4. Soumettez pour examen.

## 2. Identifiant de l'extension et de l'éditeur

- Identifiant de l'extension : les 32 lettres affichées sur la page de l'élément dans le tableau de bord et dans son URL sur le store.
- Identifiant de l'éditeur : dans le tableau de bord, **Publisher**, **Settings** (selon le [guide de l'API](https://developer.chrome.com/docs/webstore/using-api)).

## 3. Compte de service

Suivez [Use service accounts](https://developer.chrome.com/docs/webstore/service-accounts).

1. Dans la [console Google Cloud](https://console.cloud.google.com), créez ou choisissez un projet.
2. Activez la **Chrome Web Store API** pour ce projet.
3. Créez un compte de service. Il n'a besoin d'aucun rôle IAM.
4. Ouvrez le compte de service, **Clés**, **Ajouter une clé**, **JSON**. Gardez ce fichier hors du dépôt.
5. Dans le tableau de bord développeur, section **Account**, ajoutez l'adresse du compte de service (`client_email` dans le JSON). Un éditeur n'accepte qu'un seul compte de service.

## 4. Secrets GitHub

Dans le dépôt, **Settings**, **Secrets and variables**, **Actions** :

| Secret | Valeur |
| --- | --- |
| `CHROME_EXTENSION_ID` | Identifiant de l'extension de l'étape 2 |
| `CHROME_PUBLISHER_ID` | Identifiant de l'éditeur de l'étape 2 |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` | `client_email` de la clé JSON |
| `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` de la clé JSON, de `-----BEGIN` à `END PRIVATE KEY-----` ; le workflow convertit les `\n` littéraux en retours à la ligne |

`BOT_CLIENT_ID` et `BOT_PRIVATE_KEY` (l'application GitHub qui crée les releases) sont déjà requis par release-please. Tant qu'un secret `CHROME_*` manque, l'étape de publication est ignorée avec un avertissement et la release reçoit quand même ses zips. Supprimez le fichier de clé JSON une fois les secrets enregistrés.

## 5. Déroulé d'une release

1. Fusionnez des Conventional Commits (`feat:`, `fix:`) dans `main`.
2. release-please ouvre ou met à jour une PR de release avec la version suivante et le changelog.
3. La fusion de cette PR crée le tag.
4. Le job `publish` récupère le tag, lance `pnpm verify`, génère `*-chrome.zip` (version non empaquetée, garde `key`) et `*-chrome-store.zip` (`LAMBE_STORE=1`, sans `key`), vérifie les deux manifestes et joint les zips à la release.
5. `wxt submit` envoie le zip du store par l'[API CWS v2](https://developer.chrome.com/docs/webstore/api) avec le `publishType` `DEFAULT_PUBLISH` : la version est [publiée dès son approbation](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish).

Ne modifiez jamais une version ou un tag à la main.

## 6. Relancer une publication

Si l'étape du store échoue (secret mal saisi, examen en cours, panne), relancez-la sans nouvelle release : **Actions**, **Release**, **Run workflow**, saisissez le tag existant (par exemple `v0.2.0`). Le job reconstruit ce tag, remplace les fichiers de la release et soumet à nouveau. Les publications s'exécutent une par une.

Le store refuse de recevoir deux fois une version déjà acceptée : ne relancez qu'un tag qu'il n'a pas encore pris.

## 7. Ollama et l'identifiant du store

Le store attribue son propre identifiant, différent de celui de la version non empaquetée, dérivé de la `key` de `wxt.config.ts`. Les utilisateurs d'Ollama avec la version du store l'autorisent ainsi :

```
OLLAMA_ORIGINS=chrome-extension://<identifiant de l'extension sur le store>
```

Mettez à jour la section Ollama du README avec l'identifiant réel une fois l'élément créé.
