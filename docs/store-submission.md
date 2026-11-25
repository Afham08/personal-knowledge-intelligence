# Chrome Web Store submission worksheet

**Name** — Personal Knowledge Intelligence

**Short description** — Save articles around learning goals, study source-linked summaries, and practice recall privately with optional local AI.

**Full description** — Turn the articles you choose into a personal study library. Organize reading into Knowledge Spaces, set a goal for each space, and keep your own notes. Connect Ollama on your computer to generate summaries, relevance feedback, key concepts and active recall questions. Inspect the excerpts behind a reference, write an answer and request formative feedback. Reopen saved analyses offline, practice due questions, search passages, ask questions across a Knowledge Space, and export your library and practice records. Semantic search uses an optional local embedding model. An account and paid AI service are unnecessary. AI features require a compatible local Ollama installation and downloaded model.

**Single purpose** — Help readers collect and study selected articles, annotations and local PDF text against personal learning goals.

| Permission | User-facing purpose |
| --- | --- |
| activeTab | Temporary access to the page chosen with the toolbar action. |
| scripting | Run bundled extraction and native selection highlighting only on user-requested tabs. |
| sidePanel | Display the study workflow alongside the page. |
| storage | Retain the library, goals, drafts, progress, preferences and validated reviews in the browser profile. |
| Optional HTTP loopback host | Connect only to local Ollama when enabled. The provider and production connection policy restrict requests to 127.0.0.1 port 11434. |

**Privacy disclosure worksheet.** PKI handles website content, saved article URLs, user-written notes, goals and recall answers locally. AI requests, including optional passage indexing, search queries and space chat, go to the user's loopback service. The developer receives no user data. There are no accounts, analytics, ads, remote scripts or cloud inference endpoints. Use the policy to answer the dashboard's current questions accurately and review the dashboard definitions before certification.

## Owner checklist

- [ ] Choose licensing terms for original PKI code and confirm bundled third-party notices.
- [ ] Provide the publisher identity, support contact and publicly accessible privacy policy URL.
- [ ] Review the unpacked beta and authorize distribution.
- [ ] Upload the verified ZIP containing manifest.json at the root through the developer dashboard.
- [ ] Supply the included 128px PNG icon. Capture at least one real screenshot at 1280×800 or 640×400 with a public or synthetic article. Suggested views: capture and save, offline summary with sources, recall with feedback, and Space progress. Remove personal profile details.
- [ ] Prepare required dashboard promotional artwork, including the 440×280 small promo tile, and review listing previews.
- [ ] Complete the permission justifications, data disclosures, distribution settings and reviewer instructions. Tell reviewers that core capture works without AI and point to the optional Ollama setup.
- [ ] Submit only after owner approval. Verify the published extension ID in Ollama setup when testing the store build.

[Chrome Web Store image requirements](https://developer.chrome.com/docs/webstore/images) · [Manifest version rules](https://developer.chrome.com/docs/extensions/reference/manifest/version)
