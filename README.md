# Personal Knowledge Intelligence

PKI turns an article you choose into material you can study again. Save it with a learning goal, keep your own notes, and optionally use Ollama on your computer for a summary, source-linked concepts and recall practice. Capture, notes, backups and offline review work without an account or AI service.

## Install the beta in Chrome or Brave

1. Extract `pki-0.1.0-beta.1-chrome-mv3.zip` into a dedicated folder. Open the folder and check that `manifest.json` is directly inside it.
2. Open `chrome://extensions` or `brave://extensions`, enable **Developer mode**, select **Load unpacked**, and choose that folder. Use a Chromium browser version 116 or newer with side-panel support.
3. Pin **Personal Knowledge Intelligence** in the Extensions menu. On an ordinary article page, click the toolbar icon to open the panel and grant temporary access to that tab.

**Upgrading an unpacked installation:** Keep the same browser profile and extension folder. Export a backup from Settings first if your installed version supports it. Close the panel, replace the production files in that folder, and click **Reload** on PKI's extensions card. Removing the extension can erase its storage. Loading from a different path can create a different extension ID.

## From reading to review

1. Under **Spaces**, create a Knowledge Space with a name and learning goal. On **Home**, choose **Capture article**, select the space and save. The same URL can belong to multiple spaces with an independent note in each.
2. Choose **Open saved article**, or return later through Home or **Library**. Library supports searching, filtering by space, editing notes, reading extracted text and opening the original page. The optional quick start can be skipped and reopened in **Settings**.
3. With local AI enabled, choose **Analyze with AI**. Read the summary, relevance, limitations and concepts. Expand **View passages sent to Ollama** to see exactly which excerpts were used. For long articles PKI takes up to eight 400-character excerpts across the text, weighing goal relevance, distinct vocabulary and concluding material. Capture itself is capped at 100,000 characters.
4. Choose **Go to recall**. Write an answer, then choose **Check my answer** for qualitative feedback or **Reveal expected answer** for self-review. Open the source and decide whether the explanation fits. Drafts persist locally as you type. Editing an answer allows another check. A previously checked identical answer can show its saved feedback.
5. Return to the article and choose **Open saved analysis** even when Ollama is stopped or AI is disabled. The saved review identifies its model and goal. To generate fresh material for a changed goal, select the new goal and analyze. In **Spaces → Learning progress**, see distinct articles studied, questions attempted, dated answer checks and related concepts to revisit. Revisiting a result does not create an extra article or question.
6. In **Settings → Backup and restore**, choose **Export backup**. The readable JSON includes your library, notes, goals, written answers, history and cached results. Treat it as private. To restore, select the JSON file and read the number of restored and skipped records. PKI validates the whole backup before merging. Existing records win on conflicts. Repeated imports skip duplicates. Permissions and AI settings are configured separately.

## Enable optional local AI

Install Ollama, then download a model with `ollama pull qwen3:4b` or `ollama pull qwen2.5:1.5b`. Model installation requires internet access and disk space. In PKI Settings copy the exact extension origin, such as `chrome-extension://YOUR_EXTENSION_ID`. Use your actual ID in the commands below. Bind Ollama to loopback, disable cloud inference, and allow that single origin. Restart the server for environment changes to take effect.

**Windows, PowerShell.** Quit the Ollama tray application first. Leave this terminal open while using AI.

```powershell
$env:OLLAMA_HOST = "127.0.0.1:11434"
$env:OLLAMA_NO_CLOUD = "1"
$env:OLLAMA_ORIGINS = "chrome-extension://YOUR_EXTENSION_ID"
ollama serve
```

**macOS, Ollama app.** Quit the app, run the following in Terminal, then relaunch Ollama. The variables apply to the current login session.

```sh
launchctl setenv OLLAMA_HOST "127.0.0.1:11434"
launchctl setenv OLLAMA_NO_CLOUD "1"
launchctl setenv OLLAMA_ORIGINS "chrome-extension://YOUR_EXTENSION_ID"
```

**Linux, systemd installation.** Run `sudo systemctl edit ollama.service`, add the following service override, then run `sudo systemctl daemon-reload` and `sudo systemctl restart ollama`.

```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_NO_CLOUD=1"
Environment="OLLAMA_ORIGINS=chrome-extension://YOUR_EXTENSION_ID"
```

In PKI **Settings**, choose **Enable local AI**, approve local Ollama access, test the connection and select the installed model. Windows was used for beta inference checks. macOS and Linux steps follow Ollama's environment configuration guidance. [Ollama FAQ](https://docs.ollama.com/faq)

## Troubleshooting and limits

| Symptom | What to check |
| --- | --- |
| Capture is unavailable or empty | Click PKI's toolbar icon on the article tab. Browser settings pages, unsupported viewers and pages without readable prose may be unavailable. |
| Ollama is unreachable or denies the origin | Confirm the server is running on 127.0.0.1:11434, the origin matches this installation, and local access is granted. Restart Ollama after changing its environment, then test the connection. |
| No eligible model | Run `ollama list`, install a local chat model, then refresh in Settings. Update Ollama if it lacks local-only model routing. |
| Analysis times out, is truncated or returns unusable evidence | Cancel or retry after the model is loaded. Close competing workloads or choose another installed model. PKI makes at most one repair attempt for invalid analysis. A failed check leaves the written draft available. |
| Older review is missing from the offline list | The cache holds up to 30 results. For the previous analysis format, open the unchanged article and analyze once with the original goal and installed model revision so PKI can identify the cache entry. |
| Draft or backup write fails | Check browser storage and free disk space. Export a backup before removing the extension or switching profiles. Import accepts PKI JSON up to 12 MiB. |

A reference opens a real supplied passage. Whether it supports a particular interpretation still requires judgment. Small models can omit details, misjudge an answer, or repeat ideas in different words. Progress records activity and model feedback. It cannot establish mastery. Cached reviews and progress live in one browser profile. There is no automatic cross-device sync.

## Build and verify

Use Node.js 24, npm and Python 3. On Windows PowerShell, use `npm.cmd` if script execution is restricted.

```sh
npm ci
npm run typecheck
npm test
npm run package
```

The build directory is `.output/chrome-mv3`. Packaging validates manifest metadata, assets, required icons and archive contents, then writes `.output/pki-0.1.0-beta.1-chrome-mv3.zip`. If your system names Python `python3`, run `npm run build` followed by `python3 scripts/package.py`. CI runs type checking, the fixture-based test suite and packaging. Live Ollama and unpacked-browser checks are separate.

See the [privacy policy](PRIVACY.md), [beta release notes](CHANGELOG.md), [contribution guidelines](CONTRIBUTING.md) and [store submission checklist](docs/store-submission.md). The owner has yet to select a license for PKI's original code. Bundled dependency notices are included in the distribution.
