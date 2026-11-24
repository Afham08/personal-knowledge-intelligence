import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

import { readAiSettings, watchAiSettings, updateAiSettings, type AiSettings } from '../../lib/ai/local-store';
import { OLLAMA_ORIGIN_PERMISSION, ollamaProvider } from '../../lib/ai/ollama';
import { AiError, type AiModel } from '../../lib/ai/provider';
import { Icon } from './Icon';

type SettingsState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; settings: AiSettings };

type Connection =
  | { status: 'unchecked' | 'checking' }
  | { status: 'error'; message: string }
  | { status: 'available'; models: AiModel[] };

const loopbackPermission = { origins: [OLLAMA_ORIGIN_PERMISSION] };

export function useAiSettings(): SettingsState {
  const [state, setState] = useState<SettingsState>({ status: 'loading' });

  useEffect(() => {
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      try {
        const settings = await readAiSettings();
        if (revision === current) setState({ status: 'ready', settings });
      } catch {
        if (revision === current) setState({ status: 'error' });
      }
    }

    const unwatch = watchAiSettings(refresh);
    void refresh();
    return () => {
      revision++;
      unwatch();
    };
  }, []);

  return state;
}

export function AiSettingsPanel({ state }: { state: SettingsState }) {
  return (
    <section className="card" aria-labelledby="ai-settings">
      <div className="card-heading"><span className="row-icon"><Icon name="settings" /></span><h2 id="ai-settings">Local AI</h2></div>
      {state.status === 'loading' && <p role="status">Loading AI settings…</p>}
      {state.status === 'error' && <p role="alert">AI settings couldn’t load. Reopen PKI to try again.</p>}
      {state.status === 'ready' && <OllamaSettings settings={state.settings} />}
    </section>
  );
}

function OllamaSettings({ settings }: { settings: AiSettings }) {
  const [connection, setConnection] = useState<Connection>({ status: 'unchecked' });
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const models = connection.status === 'available' ? connection.models.filter(m=>!m.name.startsWith('nomic-embed-text')) : [];
  const busy = saving || connection.status === 'checking';

  async function connect() {
    setSettingsError('');
    setConnection({ status: 'checking' });
    try {
      // Request directly from the click handler to preserve the browser's user gesture.
      const allowed = await browser.permissions.request(loopbackPermission);
      if (!allowed) throw new AiError('permission', 'Brave declined access to local Ollama. Retry the connection and allow access to 127.0.0.1 when prompted.');
      if (!settings.enabled) await updateAiSettings({ enabled: true });
      setConnection({ status: 'available', models: await ollamaProvider.listModels() });
    } catch (error) {
      setConnection({
        status: 'error',
        message: error instanceof AiError ? error.message : 'Could not enable or check Ollama. Try again.',
      });
    }
  }

  async function disable() {
    setSaving(true);
    setSettingsError('');
    try {
      await updateAiSettings({ enabled: false });
      setConnection({ status: 'unchecked' });
      await browser.permissions.remove(loopbackPermission);
    } catch {
      setSettingsError('Could not update AI settings or revoke loopback access. Check the extension permissions in Brave.');
    } finally {
      setSaving(false);
    }
  }

  async function selectModel(modelName: string) {
    setSaving(true);
    setSettingsError('');
    try {
      await updateAiSettings({ modelName });
    } catch {
      setSettingsError('Could not save the selected model. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p>Local AI is optional. Save articles and notes anytime. Connect Ollama on this computer for summaries and recall feedback.</p>
      <div className="section-heading connection-heading"><p><strong>Ollama</strong></p>
        <span className="badge" data-tone={connection.status === 'available' ? 'positive' : connection.status === 'error' ? 'negative' : undefined}>
          {connection.status === 'checking' ? 'Checking' : connection.status === 'error' ? 'Connection failed'
            : connection.status === 'available' ? 'Connected' : settings.enabled ? 'Connection unchecked' : 'AI off'}</span></div>
      {settings.enabled ? (
        <div className="button-row">
          <button className="button-primary" type="button" disabled={busy} onClick={() => void connect()}>{connection.status === 'error' ? 'Retry connection' : 'Test connection'}</button>
          <button type="button" disabled={busy} onClick={() => void disable()}>Disable AI</button>
        </div>
      ) : <button className="button-primary" type="button" disabled={busy} onClick={() => void connect()}>{connection.status === 'error' ? 'Retry connection' : 'Enable local AI'}</button>}

      {connection.status === 'checking' && <p role="status">Checking Ollama…</p>}
      {connection.status === 'error' && <p role="alert">{connection.message}</p>}
      {connection.status === 'available' && (
        <p role="status">{models.length ? (models.some(({ name }) => name === settings.modelName)
            ? 'Ready to study with ' + settings.modelName + '.' : 'Connected. Choose an installed model below to start studying.') : 'Connected to Ollama. Install a local model, then test again.'}</p>
      )}
      {settings.enabled && (
        <label>
          Generation model
          <select value={settings.modelName} disabled={busy || models.length === 0}
            onChange={(event) => void selectModel(event.target.value)}>
            <option value="">Choose an installed local model</option>
            {settings.modelName && !models.some(({ name }) => name === settings.modelName) && (
              <option value={settings.modelName} disabled>{settings.modelName} ({connection.status === 'available' ? 'not installed' : 'saved, unverified'})</option>
            )}
            {models.map(({ name }) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      )}
      {connection.status === 'unchecked' && settings.enabled && <p className="metadata">Test the connection to refresh installed models.</p>}
      {settingsError && <p role="alert">{settingsError}</p>}
      <details className="disclosure" open={connection.status === 'error' || (connection.status === 'available' && models.length === 0) || undefined}>
        <summary>Set up Ollama in Brave</summary>
        <p>Install Ollama for Windows. If it is running, quit it from the system tray. Open PowerShell and run these commands to allow this extension to use Ollama on this computer.</p>
        <pre className="ai-command">{[
          '$env:OLLAMA_HOST = "127.0.0.1:11434"',
          '$env:OLLAMA_NO_CLOUD = "1"',
          '$env:OLLAMA_ORIGINS = "chrome-extension://' + browser.runtime.id + '"',
          'ollama serve',
        ].join('\n')}</pre>
        <p>Leave that window open. In a second PowerShell window, install a small model:</p>
        <pre className="ai-command">ollama pull qwen2.5:1.5b</pre>
        <p>For a larger generation model try <code>ollama pull qwen3:4b</code>. More memory and time may be needed. Optional semantic search uses a separate model:</p>
        <pre className="ai-command">ollama pull nomic-embed-text</pre>
        <button onClick={async e=>{
          const commands=Array.from(e.currentTarget.closest('details')!.querySelectorAll('pre')).map(el=>el.textContent);
          try{await navigator.clipboard.writeText(commands[0]??'');setSettingsError('Startup commands copied.');}
          catch{setSettingsError('Select and copy the commands above.');}
        }}>Copy startup commands</button>
        <button onClick={async()=>{
          try{await navigator.clipboard.writeText('ollama pull nomic-embed-text');setSettingsError('Embedding model command copied.');}
          catch{setSettingsError('Select and copy the embedding command above.');}
        }}>Copy embedding command</button>
        <p>If the port is already in use, quit your existing Ollama tray process before starting another. For denied access, compare the exact origin above and restart Ollama. Select a generation model, then use Update index only if you want semantic search.</p>
      </details>
    </>
  );
}
