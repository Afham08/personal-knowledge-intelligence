import {tutorialAction} from '../../lib/tutorial';
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { zipSync, strToU8 } from 'fflate';
import { cacheKey, fromStorage } from '../../lib/backup';
import { markdownFiles, usage } from '../../lib/portable';
import { deleteResource } from '../../lib/manage-data';
import type { Library } from '../../lib/library-model';
import { useAction } from './useAction';
import { SaveStatus } from './SaveStatus';
export function Appearance() {
  const [mode, setMode] = useState('system');
  useEffect(() => {
    let live = true;
    const sync = () =>
      void browser.storage.local.get('pki.appearance').then((d) => {
        if (live)
          setMode(
            ['dark', 'light'].includes(String(d['pki.appearance'])) ? String(d['pki.appearance']) : 'system',
          );
      });
    const listen = (changes: Record<string, unknown>) => {
      if ('pki.appearance' in changes) sync();
    };
    browser.storage.onChanged.addListener(listen);
    sync();
    return () => {
      live = false;
      browser.storage.onChanged.removeListener(listen);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);
  return (
    <label className="card">
      Appearance
      <select
        value={mode}
        onChange={(e) => void browser.storage.local.set({ 'pki.appearance': e.target.value })}
      >
        {['system', 'light', 'dark'].map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
    </label>
  );
}
export function Management({ library }: { library: Library }) {
  const action = useAction();
  const [sizes, setSizes] = useState<Record<string, number>>({}),
    [space, setSpace] = useState(''),
    [resource, setResource] = useState('');
  async function refresh() {
    const d = await browser.storage.local.get(null);
    setSizes(usage(fromStorage(d), d['pki.vector.v1']));
  }
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [library]);
  async function download() {
    const files = await markdownFiles(fromStorage(await browser.storage.local.get(null)), space, resource);
    const values = Object.values(files);
    if (!values.length) throw new Error('Choose a resource in the selected space.');
    const blob = resource
      ? new Blob([values[0]!], { type: 'text/markdown' })
      : new Blob(
          [
            new Uint8Array(
              zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))),
            ).buffer,
          ],
          { type: 'application/zip' },
        );
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = resource ? 'PKI-' + resource + '.md' : 'PKI-Markdown.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    tutorialAction('backup');return 'Export prepared.';
  }
  return (
    <details className="card">
      <summary>Storage and Markdown export</summary>
      <p>Estimated bytes of JSON data by category.</p>
      {Object.entries(sizes).map(([label, n]) => (
        <p key={label}>
          {label} · {n.toLocaleString()} B
        </p>
      ))}
      <button
        onClick={() =>
          void action.run(async () => {
            await refresh();
            return 'Usage refreshed.';
          })
        }
      >
        Refresh usage
      </button>
      <label>
        Export space
        <select
          value={space}
          onChange={(e) => {
            setSpace(e.target.value);
            setResource('');
          }}
        >
          <option value="">All spaces</option>
          {library.spaces.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Resource
        <select value={resource} onChange={(e) => setResource(e.target.value)}>
          <option value="">All resources in selection</option>
          {library.articles
            .filter((a) => !space || library.links.some((l) => l.spaceId === space && l.articleId === a.id))
            .map((a) => (
              <option value={a.id} key={a.id}>
                {a.title}
              </option>
            ))}
        </select>
      </label>
      <button onClick={() => void action.run(download)}>
        Export {resource ? 'Markdown file' : 'Markdown ZIP'}
      </button>
      <button
        disabled={!resource}
        onClick={() => {
          if (
            confirm(
              'Delete this resource from ALL spaces, including its notes, highlights, relevant chats and practice history?',
            )
          )
            void action.run(async () => {
              await deleteResource(resource);
              setResource('');
              return 'Resource deleted.';
            });
        }}
      >
        Delete selected resource
      </button>
      <button
        onClick={() => {
          if (confirm('Clear cached analyses? Saved resources, chats, and revision questions will remain.'))
            void action.run(async () => {
              await navigator.locks.request(cacheKey, () => browser.storage.local.remove(cacheKey));
              await refresh();
              return 'Analysis cache cleared.';
            });
        }}
      >
        Clear analysis cache
      </button>
      <button
        onClick={() => {
          if (
            prompt('Export a backup first. Type RESET PKI to erase all PKI data in this profile.') ===
            'RESET PKI'
          )
            void action.run(async () => {
              await browser.storage.local.clear();
              await browser.permissions.remove({ origins: ['http://127.0.0.1:11434/*'] });
              location.reload();
              return 'Reset.';
            });
        }}
      >
        Reset PKI
      </button>
      <SaveStatus state={action.state} />
    </details>
  );
}
