# Release notes

## 0.3.0-beta.1 — final portfolio beta

- Added native selection highlighting, context-based restoration, editable annotations and explicit related-resource discovery using temporary page access.
- Added local PDF import, bounded text extraction, page-aware analysis and retrieval, and graph exploration of saved resources and study concepts.
- Added Markdown and linked ZIP export, storage category estimates, resource deletion, analysis-cache clearing, a confirmed profile reset and persisted appearance preferences.
- Existing libraries and v1/v2 backups are accepted. The library uses optional annotation and page fields. Keep backups made with this version for restoring those fields.
- Verification: TypeScript and 66 automated tests passed. Brave and Chrome for Testing exercised real capture, highlighting, PDF import, graph rendering, exports and restore with fixture AI. The untouched ZIP loaded in both. Both installed Qwen models generated article analysis and recall feedback; the smaller model sometimes abstained on cross-source synthesis. Embeddings were tested with fixtures because nomic-embed-text was not installed.
- Chromium version 0.3.0.1. Upgrade by reloading the existing unpacked location. OCR, continuous page monitoring, cloud sync and store publication are outside this release.

## 0.2.0-beta.1 — connected learning

- Search saved passages locally by keyword or combine keyword and vector similarity using the optional nomic-embed-text index.
- Ask questions across a selected Knowledge Space and inspect the source passages. Explore recurring concepts, related articles, complementary explanations, potential contradictions and suggested study topics.
- Review due questions offline, adjust AI or self-assessments, and see upcoming revision dates per space. Previous attempts remain in history.
- Version 2 backups include chats, revision cards and rating history. Existing version 1 backups and local libraries remain compatible. Derived embedding vectors can be rebuilt.
- No new permissions. Numeric Chromium version 0.2.0.1. Upgrade by replacing the unpacked files in the same location and reloading the extension.

## 0.1.0-beta.1 — public beta candidate

- Capture a webpage into a goal-based Knowledge Space, share an article across spaces and keep separate notes.
- Reopen validated analyses offline with their model and original goal. Long articles use bounded excerpts across the document. Generated concept definitions are deduplicated after source validation.
- Continue recall across panel closure and browser restarts. Spaces show real study activity, dated feedback and related concepts to revisit.
- Export and merge validated local backups, including notes, recall drafts, progress and cached analyses. Existing records take precedence.
- Includes a production content security policy, extension icons, tested packaging and a CI verification workflow.

**Upgrade.** Reload the existing unpacked installation from the same folder and profile to retain its library. Older v4 cache entries need one lookup with the matching installed model revision, goal and unchanged article before offline access is available. Older versions did not persist recall drafts.

**Limits.** Source references and formative feedback require reader judgment. The cache holds 30 reviews. Files exported by users are readable JSON. The beta is prepared for unpacked testing. Store publication and a project license require the owner's decision.

The package metadata uses SemVer 0.1.0-beta.1. Chromium uses the increasing numeric manifest version 0.1.0.1 and displays the beta label via version_name. Future uploads must use a higher numeric version, including the first stable release.
