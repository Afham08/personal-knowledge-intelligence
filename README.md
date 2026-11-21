# Personal Knowledge Intelligence

PKI is a Chrome and Brave extension for organizing online reading around personal learning goals. It extracts article text on request, saves articles and notes to local Knowledge Spaces, and offers optional local AI for relevance, summaries, key concepts, and active recall with optional formative feedback.

## Build and install locally

In Windows PowerShell, run these commands from the project folder with Node.js 24.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Open `brave://extensions` and enable **Developer mode**. Click **Load unpacked** and choose the project's `.output\chrome-mv3` directory. Click **Reload** on PKI's card after rebuilding. In Chrome, use `chrome://extensions`.

Pin **Personal Knowledge Intelligence** from the browser's Extensions menu. Open a public article and click the PKI toolbar icon to grant that tab temporary access. Use **Extract article**, select a Knowledge Space, and save the article with an optional note. Saving the same article twice in one space keeps the existing entry. Saving it to another space gives that space its own note.

## Optional Ollama setup in Brave

1. Install [Ollama for Windows](https://ollama.com/download/windows). In `brave://extensions`, find PKI's extension ID. The side panel also prints your exact origin under **AI settings → Set up Ollama in Brave**.
2. Quit Ollama from the Windows notification area if it is already running. Start it in PowerShell using the following configuration, replacing `YOUR_EXTENSION_ID` with the ID shown in Brave. Leave this terminal open.

   ```powershell
   $env:OLLAMA_HOST = "127.0.0.1:11434"
   $env:OLLAMA_NO_CLOUD = "1"
   $env:OLLAMA_ORIGINS = "chrome-extension://YOUR_EXTENSION_ID"
   ollama serve
   ```

3. In a second PowerShell window, run `ollama pull qwen2.5:1.5b`. This [lightweight model](https://ollama.com/library/qwen2.5:1.5b) is a 986 MB download. Inference uses additional RAM and can take a few minutes on a CPU. Small models are more likely to produce invalid citations or incomplete answers. Pick another installed local chat model if your machine can run it.
4. In the side panel, open **AI settings**, choose **Enable local AI**, and grant the loopback permission. Select your installed model. Use **Test connection** after starting Ollama or installing a model. If connection fails, check the endpoint, compare the extension ID, and restart Ollama after changing the variables. Keep Ollama bound to loopback since the local API does not require authentication.

## Test the analysis workflow

1. Open a public article, click PKI's toolbar icon, and choose a Knowledge Space with a learning goal.
2. Click **Extract article**, then **Analyze with AI**. Use **Read extracted text** to inspect what PKI extracted. Open **View passages sent to Ollama** to see the input and compare the character and passage counts. A **Source reference** links a particular claim to an excerpt for you to check.
3. In **Active recall**, write an answer and click **Check my answer**. Read the qualitative feedback, any missing or inaccurate ideas, and one suggestion. Expand the referenced sentence before deciding whether you agree. **Reveal expected answer** remains available independently.
4. Click **Next question**, type a draft, then navigate back and forth. Both drafts should remain available during this practice session. Try **Cancel answer check** on a fresh check and confirm the draft remains editable.
5. Analyze again with the same article, model, and goal. Check for **Using a cached analysis**. Change the learning goal and confirm the next analysis runs again.
6. Stop Ollama and use **Test connection** to check the connection error. The article library, notes, and saving remain available. On `brave://settings`, extraction should be unavailable.

## Privacy and known limits

- AI starts disabled. PKI requests optional access to the loopback Ollama port only when the user enables or tests AI. Its provider uses the fixed local port 11434 and rejects redirects. The Ollama setup above disables cloud inference and allows PKI's exact extension origin.
- An explicit analysis sends the article title, the selected goal, and up to eight plain-text passages of up to 400 characters each to Ollama. Notes, page URLs, browsing history, and raw HTML are excluded. For long articles, PKI retains the introduction and selects goal-related excerpts from bands across the rest of the text. It favors prose over bibliographic text and reports partial coverage, including when extraction hit its limit.
- PKI validates every passage ID against the passages supplied for that request and displays their text directly. A source reference identifies an excerpt for you to check. It does not establish that the excerpt supports the model's claim. PKI retries invalid model output once, with cancellation available during both attempts.
- Clicking **Check my answer** sends the current question, expected answer, verified passage, and draft (up to 1,200 characters) to Ollama with an explicit local-only model reference. If your Ollama version lacks this routing, update Ollama. Feedback and drafts live only in the current practice session. PKI does not write them to storage or reuse them across analyses.
- Recall feedback is formative. A valid source reference shows where the evidence came from. The model can misjudge a paraphrase or select a sentence that only partly supports its feedback. It can answer **Unable to Assess** when a claim exceeds the source. Use the source and expected answer to make your own judgment.
- Analysis results are stored in the browser profile. PKI keeps up to 30 validated results and checks the current model digest before reuse. Results from previous prompt or excerpt-selection versions are skipped. An Ollama connection is therefore needed even for a cache hit. The library is independent of this cache.
- Automated tests use mock Ollama responses to cover model discovery, article coverage, answer feedback, validation, errors, cancellation, and cache behavior. `npm.cmd test` also checks article IDs and duplicate prevention. A real model must be checked separately in Brave.
