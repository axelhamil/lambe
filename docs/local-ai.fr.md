# Faire tourner une IA locale pour Lambë

[English](local-ai.md)

Ce guide installe un modèle de traduction sur votre ordinateur et y relie Lambë. Il suffit de copier et coller quelques commandes, sans rien programmer.

## Ce qu'est une IA locale

- Une IA locale est un modèle de langage qui tourne sur votre ordinateur, et non sur le serveur d'une entreprise.
- Confidentielle : les pages que vous traduisez ne quittent pas votre machine.
- Gratuite et hors ligne : une fois le modèle téléchargé, elle ne coûte rien et fonctionne sans internet.

## Ce qu'il faut à votre ordinateur

Le modèle doit tenir en mémoire : la mémoire de la carte graphique (VRAM) si vous en avez une, sinon la RAM de l'ordinateur. Plus il tient dans la carte graphique, plus la traduction est rapide.

- **Minimum** : 8 Go de RAM et 5 Go d'espace disque libre, avec le petit modèle `translategemma:4b`.
- **Recommandé** : 16 Go de RAM, une carte graphique avec 12 Go de VRAM ou un Mac Apple Silicon avec 16 Go, et 10 Go d'espace disque libre, avec le modèle par défaut `translategemma:12b`.
- **Système** : Windows 10 22H2 ou plus récent, macOS 14 Sonoma ou plus récent, ou un Linux récent.

| Votre ordinateur | Modèle à choisir | Téléchargement | À quoi s'attendre |
| --- | --- | --- | --- |
| Sans carte graphique, 8 Go de RAM | `translategemma:4b` | 3,3 Go | Lent : il faut patienter sur les longues pages. Correct pour des textes courts. |
| Portable, 16 Go de RAM, sans carte graphique | `translategemma:4b` | 3,3 Go | Utilisable. `12b` tourne aussi, mais environ 3 fois plus lentement. |
| Carte graphique avec 8 Go de VRAM | `translategemma:4b`, ou `12b` | 3,3 Go ou 8,1 Go | `4b` est rapide. `12b` tient de justesse : une partie tourne sur le processeur, donc plus lentement. |
| Carte graphique avec 12 Go de VRAM ou plus | `translategemma:12b` | 8,1 Go | Rapide : c'est la configuration par défaut avec laquelle Lambë est testé. |
| Mac Apple Silicon, 8 Go | `translategemma:4b` | 3,3 Go | Utilisable. |
| Mac Apple Silicon, 16 Go ou plus | `translategemma:12b` | 8,1 Go | Utilisable sur un M1 de base, plus rapide sur les puces Pro et Max, qui ont plus de bande passante mémoire. |
| Carte graphique avec 24 Go de VRAM | `translategemma:27b` (facultatif) | 17 Go | Meilleure qualité, demande une carte comme une RTX 3090. |

D'où viennent ces chiffres : Google a mesuré les poids des modèles Gemma 3 (sur lesquels TranslateGemma est construit) à 2,6 Go pour le 4B, 6,6 Go pour le 12B et 14,1 Go pour le 27B en 4 bits, plus de la mémoire pour le texte en cours de traitement. Un Raspberry Pi 5, un processeur modeste sans carte graphique, fait tourner le 4B à environ 3,5 tokens (morceaux de mots) par seconde et ne peut pas charger le 12B. Un Mac M1 de base génère environ 14 tokens par seconde avec un modèle 7B et un M2 environ 22, et la vitesse baisse quand le modèle grossit. Le « 3 fois plus lentement » de `12b` sur processeur est une estimation tirée de sa taille (3 fois plus de paramètres), pas une mesure.

## 1. Installer Ollama

Ollama est le programme gratuit qui fait tourner le modèle. Choisissez votre système.

**Windows** : téléchargez et lancez `OllamaSetup.exe` depuis [ollama.com/download/windows](https://ollama.com/download/windows). Ollama s'installe ensuite dans la zone de notification, à côté de l'horloge.

**macOS** : téléchargez `ollama.dmg` depuis [ollama.com/download/mac](https://ollama.com/download/mac), ouvrez-le, glissez Ollama dans Applications, puis ouvrez-le une première fois.

**Linux** : ouvrez un terminal et collez :

```sh
curl -fsSL https://ollama.com/install.sh | sh
```

Pour ouvrir un terminal : sous Windows, appuyez sur la touche Windows, tapez `PowerShell` puis Entrée ; sous macOS, appuyez sur `Cmd+Espace`, tapez `Terminal` puis Entrée.

Vérifiez que tout fonctionne :

```sh
ollama --version
```

Un numéro de version s'affiche. Ouvrez ensuite [http://localhost:11434](http://localhost:11434) dans Chrome : la page indique `Ollama is running`.

## 2. Télécharger le modèle

Lambë utilise par défaut `translategemma:12b`, le modèle de traduction de Google. Dans le terminal :

```sh
ollama pull translategemma:12b
```

Le téléchargement prend un moment (voir la taille dans le tableau plus haut). Sur un ordinateur plus modeste, prenez plutôt le petit :

```sh
ollama pull translategemma:4b
```

Pour voir les modèles installés :

```sh
ollama list
```

## 3. Autoriser Lambë à parler à Ollama

Ollama refuse les requêtes des extensions qu'il ne connaît pas. Le réglage `OLLAMA_ORIGINS` lui dit d'accepter Lambë. L'identifiant ci-dessous est celui de la version compilée depuis ce dépôt ; avec la version du Chrome Web Store, utilisez l'identifiant affiché dans `chrome://extensions` ou par le test de connexion des réglages (il donne les commandes exactes avec le bon identifiant).

**Windows** (dans PowerShell) :

```powershell
setx OLLAMA_ORIGINS "chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Quittez Ollama depuis la zone de notification (clic droit sur l'icône, Quit Ollama), puis relancez-le.

**macOS** (dans Terminal) :

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Quittez l'application Ollama, puis rouvrez-la.

**Linux** :

```sh
sudo systemctl edit ollama
```

Un éditeur s'ouvre. Ajoutez ces 2 lignes, puis enregistrez et fermez :

```ini
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Redémarrez ensuite Ollama :

```sh
sudo systemctl restart ollama
```

## 4. Configurer Lambë

1. Installez Lambë. La page des réglages s'ouvre d'elle-même ; sinon, faites un clic droit sur l'icône de Lambë dans la barre d'outils et choisissez **Options**.
2. Lisez l'écran d'accueil et cliquez sur **Accepter et activer la traduction**. Lambë n'envoie rien avant votre accord.
3. Ouvrez la section **Fournisseur**. Gardez **Ollama** comme type de serveur et `http://localhost:11434` comme adresse du serveur, puis choisissez `translategemma:12b` (ou le modèle téléchargé) dans la liste des modèles.
4. Cliquez sur **Tester la connexion**. Le test confirme la connexion ou explique quoi corriger ; cliquez ensuite sur **Enregistrer le fournisseur**.
5. Ouvrez une page et cliquez sur l'icône de Lambë dans la barre d'outils, ou appuyez sur `Alt+L`. Pour garder la bulle sur toutes les pages, activez-la dans la section **Sites**.

## Autre option : un serveur compatible OpenAI

Lambë fonctionne aussi avec tout serveur qui parle l'API d'OpenAI.

- **LM Studio**, une application gratuite avec interface graphique : téléchargez-la sur [lmstudio.ai](https://lmstudio.ai), téléchargez un modèle dans l'application, puis démarrez son serveur local. Dans Lambë, choisissez **Compatible OpenAI** et saisissez `http://localhost:1234/v1`.
- **Une API hébergée** : choisissez **Compatible OpenAI**, saisissez l'URL de base du service et votre clé d'API. Chrome demande l'accès à cette adresse. Votre texte part alors chez cette entreprise : lisez sa politique de confidentialité.

Lambë a des consignes adaptées aux modèles TranslateGemma ; les autres modèles reçoivent des consignes générales, choisissez donc un modèle qui suit bien les instructions.

## En cas de problème

| Message de Lambë | Que faire |
| --- | --- |
| Le serveur de modèles est injoignable | Ollama ne tourne pas. Lancez l'application (Windows, macOS) ou `sudo systemctl start ollama` (Linux), puis vérifiez [http://localhost:11434](http://localhost:11434). Vérifiez l'URL de base dans les réglages. |
| Ollama refuse les requêtes venant de ... | Refaites [l'étape 3](#3-autoriser-lambë-à-parler-à-ollama) avec l'origine indiquée dans le message, puis redémarrez Ollama. |
| Le modèle ... n'est pas installé | Lancez `ollama pull` avec ce nom, ou choisissez un modèle installé dans les réglages. `ollama list` montre ce que vous avez. |
| Le serveur de modèles n'a pas répondu en ... ms | L'ordinateur est trop lent pour ce modèle. Passez à `translategemma:4b`, fermez les programmes gourmands, réessayez. |
| Le serveur de modèles a renvoyé une réponse inattendue | Réessayez. Si cela continue, choisissez un autre modèle. |
| Le serveur ... a refusé la clé d'API | Seulement avec un serveur compatible OpenAI : vérifiez la clé dans la section Fournisseur. |
| Lambë a besoin de votre accord | Ouvrez les réglages et acceptez, dans l'écran d'accueil ou dans **Confidentialité et à propos**. |
| Lambë ne peut pas fonctionner sur cette page | Les pages de Chrome et le Chrome Web Store sont fermés aux extensions. Essayez une autre page. |
| Vos réglages enregistrés ne sont pas valides | Cliquez sur **Rétablir les valeurs par défaut** dans le bandeau de la page des réglages. |

**La traduction est lente.** La première traduction charge le modèle en mémoire, ce qui peut prendre quelques secondes ; les suivantes vont plus vite. Si elle reste lente, prenez le petit modèle. `ollama ps` montre où tourne le modèle : `100% GPU` est le cas rapide, `100% CPU` ou un partage signifie que le modèle ne tient pas dans la mémoire de votre carte graphique.

**Mémoire insuffisante, ou l'ordinateur se fige.** Le modèle est trop gros pour votre RAM ou votre mémoire graphique. Fermez d'autres programmes ou passez à `translategemma:4b`.

## Sources

- Ollama, versions de TranslateGemma et tailles de téléchargement : https://ollama.com/library/translategemma/tags
- Google, fiche du modèle TranslateGemma 4B (55 langues, construit sur Gemma 3) : https://huggingface.co/google/translategemma-4b-it
- Google Developers Blog, mémoire de Gemma 3 en 4 bits et cartes graphiques adaptées : https://developers.googleblog.com/en/gemma-3-quantized-aware-trained-state-of-the-art-ai-to-consumer-gpus/
- Gemma 3 mesuré sur un Raspberry Pi 5 avec Ollama, sur processeur seul : https://www.kunalganglani.com/blog/gemma-3-raspberry-pi-5-benchmark.md
- llama.cpp, vitesse sur Apple Silicon (LLaMA 7B, 4 bits) : https://github.com/ggml-org/llama.cpp/discussions/4167
- Guides d'installation d'Ollama : https://docs.ollama.com/windows, https://docs.ollama.com/macos, https://docs.ollama.com/linux
- FAQ d'Ollama (`OLLAMA_ORIGINS`, port 11434, `ollama ps`) : https://docs.ollama.com/faq
- Serveur compatible OpenAI de LM Studio : https://lmstudio.ai/docs/developer/openai-compat
