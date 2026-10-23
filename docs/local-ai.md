# Run a local AI for Lambë

[Français](local-ai.fr.md)

This guide sets up a translation model on your own computer and connects Lambë to it. You copy and paste a few commands; no coding is needed.

## What a local AI is

- A local AI is a language model that runs on your computer instead of a company's server.
- Private: the pages you translate never leave your machine.
- Free and offline: once the model is downloaded, it costs nothing and works without internet.

## What your computer needs

The model has to fit in memory: graphics memory (VRAM) if you have a graphics card, otherwise the computer's RAM. The more of it fits on the graphics card, the faster it translates.

- **Minimum**: 8 GB of RAM and 5 GB of free disk, with the small model `translategemma:4b`.
- **Recommended**: 16 GB of RAM, a graphics card with 12 GB of VRAM or a Mac with Apple Silicon and 16 GB, and 10 GB of free disk, with the default model `translategemma:12b`.
- **System**: Windows 10 22H2 or newer, macOS 14 Sonoma or newer, or a recent Linux.

| Your computer | Model to pick | Download | What to expect |
| --- | --- | --- | --- |
| No graphics card, 8 GB RAM | `translategemma:4b` | 3.3 GB | Slow: expect to wait on long pages. Fine for short texts. |
| Laptop, 16 GB RAM, no graphics card | `translategemma:4b` | 3.3 GB | Usable. `12b` also runs but about 3 times slower. |
| Graphics card with 8 GB VRAM | `translategemma:4b`, or `12b` | 3.3 GB or 8.1 GB | `4b` is fast. `12b` is a tight fit: part of it runs on the CPU, so it is slower. |
| Graphics card with 12 GB VRAM or more | `translategemma:12b` | 8.1 GB | Fast: the default setup Lambë is tested with. |
| Mac with Apple Silicon, 8 GB | `translategemma:4b` | 3.3 GB | Usable. |
| Mac with Apple Silicon, 16 GB or more | `translategemma:12b` | 8.1 GB | Usable on a base M1, faster on Pro and Max chips, which have more memory bandwidth. |
| Graphics card with 24 GB VRAM | `translategemma:27b` (optional) | 17 GB | Best quality, needs a card such as an RTX 3090. |

Why these numbers: Google measured the weights of the Gemma 3 models (which TranslateGemma is built on) at 2.6 GB for 4B, 6.6 GB for 12B and 14.1 GB for 27B in 4 bit, plus extra memory for the text being processed. A Raspberry Pi 5, a weak CPU with no graphics card, runs the 4B at about 3.5 tokens (pieces of words) per second and cannot fit the 12B. A base M1 Mac generates about 14 tokens per second on a 7B model and an M2 about 22, and speed drops as the model grows. The "3 times slower" for `12b` on CPU is an estimate from its size (3 times the parameters), not a measurement.

## 1. Install Ollama

Ollama is the free program that runs the model. Pick your system.

**Windows**: download and run `OllamaSetup.exe` from [ollama.com/download/windows](https://ollama.com/download/windows). Ollama then lives in the tray, next to the clock.

**macOS**: download `ollama.dmg` from [ollama.com/download/mac](https://ollama.com/download/mac), open it, drag Ollama into Applications, then open it once.

**Linux**: open a terminal and paste:

```sh
curl -fsSL https://ollama.com/install.sh | sh
```

To open a terminal: on Windows press the Windows key, type `PowerShell` and press Enter; on macOS press `Cmd+Space`, type `Terminal` and press Enter.

Check that it works:

```sh
ollama --version
```

You should see a version number. Then open [http://localhost:11434](http://localhost:11434) in Chrome: the page says `Ollama is running`.

## 2. Download the model

Lambë uses `translategemma:12b` by default, Google's translation model. In the terminal:

```sh
ollama pull translategemma:12b
```

The download takes a while (see the table above for the size). On a weaker computer, take the small one instead:

```sh
ollama pull translategemma:4b
```

Check the list of installed models:

```sh
ollama list
```

## 3. Let Lambë talk to Ollama

Ollama refuses requests from browser extensions it does not know. You tell it to accept Lambë with the `OLLAMA_ORIGINS` setting. The id below is the one of the build from this repository; with the Chrome Web Store version, use the id shown in `chrome://extensions` or in the connection test of the settings (it gives you the exact commands with the right id).

**Windows** (in PowerShell):

```powershell
setx OLLAMA_ORIGINS "chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Quit Ollama from the tray (right click the icon, Quit Ollama), then start it again.

**macOS** (in Terminal):

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Quit the Ollama app, then open it again.

**Linux**:

```sh
sudo systemctl edit ollama
```

An editor opens. Add these 2 lines, then save and close:

```ini
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://dccgcoohbalgmgkflpndagoallbcgnch"
```

Then restart Ollama:

```sh
sudo systemctl restart ollama
```

## 4. Set up Lambë

1. Install Lambë. The settings page opens on its own; otherwise right click the Lambë icon in the toolbar and pick **Options**.
2. Read the welcome screen and click **Agree and turn on translation**. Lambë sends nothing before you agree.
3. Open the **Provider** section. Keep **Ollama**, the base URL `http://localhost:11434` and pick `translategemma:12b` (or the model you downloaded) in the model list.
4. Click the connection test. It either confirms the connection or explains what to fix.
5. Open any page and click the bubble, or press `Alt+L`.

## Other option: an OpenAI-compatible server

Lambë also works with any server that speaks the OpenAI API.

- **LM Studio**, a free desktop app with a graphical interface: download it from [lmstudio.ai](https://lmstudio.ai), download a model in the app, then start its local server. In Lambë, choose **OpenAI-compatible** and enter `http://localhost:1234/v1`.
- **A hosted API**: choose **OpenAI-compatible**, enter the base URL of the service and your API key. Chrome asks for access to that address. Your text is then sent to that company, so read its privacy policy.

Lambë has a prompt tuned for TranslateGemma models; any other model gets a general instruction prompt, so pick a model that follows instructions well.

## Troubleshooting

| Message in Lambë | What to do |
| --- | --- |
| The model server at ... is not reachable | Ollama is not running. Start the app (Windows, macOS) or run `sudo systemctl start ollama` (Linux), then check [http://localhost:11434](http://localhost:11434). Check the base URL in the settings. |
| Ollama refused requests from ... | Redo [step 3](#3-let-lambë-talk-to-ollama) with the origin shown in the message, and restart Ollama. |
| The model ... is not installed | Run `ollama pull` with that name, or pick an installed model in the settings. `ollama list` shows what you have. |
| The model server did not answer within ... ms | The computer is too slow for that model. Use `translategemma:4b`, close other heavy programs, try again. |
| The model server sent an unexpected answer | Try again. If it keeps happening, pick another model. |
| The server at ... rejected the API key | Only with an OpenAI-compatible server: check the key in the Provider section. |
| Lambë needs your consent | Open the settings and accept, in the welcome screen or in **Privacy and about**. |
| Lambë cannot run on this page | Chrome pages and the Chrome Web Store are closed to extensions. Try another page. |
| Your saved settings are not valid | Click **Reset to defaults** in the banner of the settings page. |

**Translation is slow.** The first translation loads the model in memory, which can take some seconds; the next ones are faster. If it stays slow, take the smaller model. `ollama ps` shows where the model runs: `100% GPU` is the fast case, `100% CPU` or a split means the model does not fit in your graphics memory.

**Out of memory, or the computer freezes.** The model is too large for your RAM or graphics memory. Close other programs or switch to `translategemma:4b`.

## Sources

- Ollama, TranslateGemma tags and download sizes: https://ollama.com/library/translategemma/tags
- Google, TranslateGemma 4B model card (55 languages, built on Gemma 3): https://huggingface.co/google/translategemma-4b-it
- Google Developers Blog, Gemma 3 memory in 4 bit and the GPUs that fit them: https://developers.googleblog.com/en/gemma-3-quantized-aware-trained-state-of-the-art-ai-to-consumer-gpus/
- Gemma 3 measured on a Raspberry Pi 5 with Ollama, CPU only: https://www.kunalganglani.com/blog/gemma-3-raspberry-pi-5-benchmark.md
- llama.cpp, speed on Apple Silicon (LLaMA 7B, 4 bit): https://github.com/ggml-org/llama.cpp/discussions/4167
- Ollama install guides: https://docs.ollama.com/windows, https://docs.ollama.com/macos, https://docs.ollama.com/linux
- Ollama FAQ (`OLLAMA_ORIGINS`, port 11434, `ollama ps`): https://docs.ollama.com/faq
- LM Studio OpenAI-compatible server: https://lmstudio.ai/docs/developer/openai-compat
