# Release notes

## 0.1.0-beta.1 — public beta candidate

- Capture a webpage into a goal-based Knowledge Space, share an article across spaces and keep separate notes.
- Reopen validated analyses offline with their model and original goal. Long articles use bounded excerpts across the document. Generated concept definitions are deduplicated after source validation.
- Continue recall across panel closure and browser restarts. Spaces show real study activity, dated feedback and related concepts to revisit.
- Export and merge validated local backups, including notes, recall drafts, progress and cached analyses. Existing records take precedence.
- Includes a production content security policy, extension icons, tested packaging and a CI verification workflow.

**Upgrade.** Reload the existing unpacked installation from the same folder and profile to retain its library. Older v4 cache entries need one lookup with the matching installed model revision, goal and unchanged article before offline access is available. Older versions did not persist recall drafts.

**Limits.** Source references and formative feedback require reader judgment. The cache holds 30 reviews. Files exported by users are readable JSON. The beta is prepared for unpacked testing. Store publication and a project license require the owner's decision.

The package metadata uses SemVer 0.1.0-beta.1. Chromium uses the increasing numeric manifest version 0.1.0.1 and displays the beta label via version_name. Future uploads must use a higher numeric version, including the first stable release.
