import { knowledgeKey } from '../../lib/revision';
import { useState } from 'react';
import { browser } from 'wxt/browser';
import { BACKUP_LIMIT, cacheKey, fromStorage, libraryKey, mergeBackup, parseBackup } from '../../lib/backup';

export function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function perform(action: () => Promise<string>) {
    setBusy(true); setError(''); setMessage('');
    try { setMessage(await action()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not complete the backup operation.'); }
    finally { setBusy(false); }
  }
  async function download() {
    const json = JSON.stringify(fromStorage(await browser.storage.local.get(null)));
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'PKI-backup-' + new Date().toISOString().slice(0,10) + '.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    return 'Backup prepared for download.';
  }
  async function restore(file: File) {
    if (file.size > BACKUP_LIMIT) throw new Error('Backup exceeds the 12 MiB import limit.');
    const incoming = await parseBackup(await file.text());
    // Hold the same locks as normal writers and commit the entire merge in one storage operation.
    return navigator.locks.request(libraryKey, () => navigator.locks.request(cacheKey, () =>
      navigator.locks.request('pki.study', () => navigator.locks.request(knowledgeKey, async () => {
        const result = mergeBackup(fromStorage(await browser.storage.local.get(null)), incoming);
        if (result.added) await browser.storage.local.set(result.data);
        return result.added + ' records restored. ' + result.kept + ' existing or over-limit records skipped.';
      }))));
  }
  return <section className="card"><h2>Backup and restore</h2>
    <p>Export spaces, articles, notes, drafts, feedback, revision history, space chats and cached analyses as a readable JSON file. Keep it somewhere private.</p>
    <button type="button" disabled={busy} onClick={() => void perform(download)}>Export backup</button>
    <label>Restore from a PKI backup<input type="file" accept=".json,application/json" disabled={busy} onChange={e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (file) void perform(() => restore(file));
    }} /></label>
    <p className="metadata">Restoring adds missing records. Existing records take priority. AI settings and permissions stay under your control.</p>
    {busy && <p role="status">Preparing your data…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
