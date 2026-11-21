# Personal Knowledge Intelligence

PKI is a Chrome and Brave extension for organizing online reading around personal learning goals. The current version extracts article text on request and saves it, along with notes, to local Knowledge Spaces.

## Build locally

In Windows PowerShell, run these commands from the project folder with Node.js 24.

```powershell
npm.cmd ci
npm.cmd run typecheck
node --test tests/library-model.test.mjs
npm.cmd run build
```

## Reload and test in Brave

1. Open `brave://extensions` and turn on **Developer mode**. If PKI is already installed from this workspace, click its **Reload** button. Otherwise, click **Load unpacked** and select `C:\personal-knowledge-intelligence\.output\chrome-mv3`.
2. Open a public article, such as `https://en.wikipedia.org/wiki/Knowledge`. Open Brave's Extensions menu, pin **Personal Knowledge Intelligence**, and click its toolbar icon. Check that the side panel shows the article's title and URL.
3. Create two Knowledge Spaces with different names and goals. Select the first space, click **Extract article**, and open **Read extracted text**. Check that ordinary article text appears.
4. Save the article with a note. Save it again in the same space and verify that the library shows one entry and keeps the original note. Save the same article in the other space with a different note and verify that each space shows its own note.
5. Close and reopen the panel. Switch spaces and verify the goals, article text, and notes are still available. Edit a goal or note, then reopen the panel again to check that the edit persists.
6. Switch to an article in a new tab and check that PKI asks you to grant access there. Click its toolbar icon to grant temporary access and extract again. Try `brave://settings` and confirm there is no extraction option.

In Chrome, use `chrome://extensions` and `chrome://settings` for the same checks.

## Permissions and local data

- `sidePanel` opens the browser side panel.
- `activeTab` grants access to a tab after a toolbar click.
- `scripting` runs the packaged extractor only when **Extract article** is clicked.
- `storage` keeps spaces, article text, and notes in your local browser profile.

Article text is stored as plain text and capped at 100,000 characters. One stored article can be linked to multiple spaces, each with its own note. Article URLs retain query parameters and common hash routes so separate pages retain separate IDs. This version keeps saved data in the browser profile and makes no AI or backend requests.
