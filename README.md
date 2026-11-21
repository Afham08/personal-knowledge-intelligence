# Personal Knowledge Intelligence

PKI is a Chrome extension for building personal knowledge. The starter provides a React popup with a counter to check that Chrome loads the extension and React responds to a click.

## Local setup

Run these commands in Windows PowerShell from the project folder.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
```

## Check the extension in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `.output/chrome-mv3` folder.
3. Open **Personal Knowledge Intelligence** from Chrome's Extensions menu.
4. Check that the popup starts at **Click count: 0** and that two clicks change it to **Click count: 2**. Close and reopen the popup to check that the count starts at zero again.

After editing the source, rebuild the extension and click the reload button on its card in `chrome://extensions`.
