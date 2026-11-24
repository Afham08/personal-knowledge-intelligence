import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if (!process.env.PKI_TEST_BROWSER)
  throw new Error(
    'Set PKI_TEST_BROWSER to the Brave or Chrome for Testing executable.',
  );
const root = await mkdtemp(path.join(tmpdir(), 'pki-shared-reader-')),
  ext = path.join(root, 'extension'),
  profile = path.join(root, 'profile');
await cp('.output/chrome-mv3', ext, { recursive: true });
const manifest = path.join(ext, 'manifest.json'),
  data = JSON.parse(await readFile(manifest));
data.host_permissions = ['http://127.0.0.1/*', 'http://127.0.0.1:11434/*'];
data.optional_host_permissions = [];
await writeFile(manifest, JSON.stringify(data));
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(
    '<title>Orchard</title><article><h1>Orchard</h1><p>' +
      'Different branches receive different numbers of pollinator visits. Comparing fruit set on these branches can reveal patterns in the orchard. '.repeat(
        8,
      ) +
      '</p></article>',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const child = spawn(
  process.env.PKI_TEST_BROWSER,
  [
    '--headless=new',
    '--no-first-run',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    '--disable-extensions-except=' + ext,
    '--load-extension=' + ext,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let ws;
async function until(f) {
  for (let i = 0; i < 150; i++) {
    let v = await f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('timeout ' + f);
}
try {
  const port = (
      await until(() =>
        readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(
          () => '',
        ),
      )
    ).split('\n')[0],
    base = 'http://127.0.0.1:' + port;
  const worker = await until(async () =>
    (await (await fetch(base + '/json/list')).json()).find(
      (t) => t.type === 'service_worker' && t.url.endsWith('/background.js'),
    ),
  );
  const panel = worker.url.replace('background.js', 'sidepanel.html');
  const target = await (
    await fetch(base + '/json/new?' + encodeURIComponent(panel), {
      method: 'PUT',
    })
  ).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const calls = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    calls.get(m.id)?.(m);
  };
  async function run(expression) {
    const n = ++id,
      p = new Promise((r) => calls.set(n, r));
    ws.send(
      JSON.stringify({
        id: n,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      }),
    );
    const m = await p;
    calls.delete(n);
    if (m.error || m.result.exceptionDetails) throw Error(JSON.stringify(m));
    return m.result.result.value;
  }
  async function click(label) {
    await until(() =>
      run(
        "(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.checkVisibility()&&!b.disabled&&b.innerText.trim()===" +
          JSON.stringify(label) +
          ');if(!b)return false;b.click();return true})()',
      ),
    );
  }
  async function select(selector, value) {
    await run(
      '(()=>{const s=document.querySelector(' +
        JSON.stringify(selector) +
        ');s.value=' +
        JSON.stringify(value) +
        ";s.dispatchEvent(new Event('change',{bubbles:true}))})()",
    );
  }
  await until(() => run("!!document.querySelector('nav')"));
  await run(
    'chrome.storage.local.set(' +
      JSON.stringify({
        'pki.library': {
          version: 1,
          spaces: [
            { id: 'a', name: 'First space', learningGoal: 'First goal' },
            { id: 'b', name: 'Second space', learningGoal: 'Second goal' },
          ],
          articles: [],
          links: [],
        },
        'pki.ai.settings': { enabled: true, modelName: 'fixture' },
      }) +
      ')',
  );
  await run(
    'chrome.tabs.create({active:true,url:' +
      JSON.stringify('http://127.0.0.1:' + server.address().port + '/orchard') +
      '}).then(t=>t.id)',
  );
  await click('Capture article');
  await click('Save article');
  await click('Open saved article');
  await until(() => run("document.body.innerText.includes('First goal')"));
  async function send(method, params = {}) {
    const n = ++id,
      p = new Promise((r) => calls.set(n, r));
    ws.send(JSON.stringify({ id: n, method, params }));
    const m = await p;
    calls.delete(n);
    if (m.error) throw Error(JSON.stringify(m.error));
    return m.result;
  }
  const before = ws.onmessage;
  let hits = 0;
  ws.onmessage = (e) => {
    before(e);
    const m = JSON.parse(e.data);
    if (m.method !== 'Fetch.requestPaused') return;
    hits++;
    const p = m.params;
    const a = {
      relevance: {
        level: 'High',
        topics: [],
        alignment: 'Compares observations.',
        limitations: [],
        evidence: ['P1'],
      },
      summary: {
        overview: 'Bee visits vary.',
        ideas: ['Compare observations.'],
        takeaways: ['Count visits.'],
      },
      concepts: [
        {
          term: 'Fruit set',
          explanation: 'An outcome compared across branches.',
          evidence: 'P1',
        },
      ],
      recall: [
        'What varied?',
        'What was compared?',
        'Where were observations made?',
      ].map((question, i) => ({
        question,
        answer: ['Bee visits.', 'Fruit set.', 'In the orchard.'][i],
        evidence: 'P1',
      })),
    };
    const f = {
      verdict: 'Correct',
      understood: 'Visits varied.',
      issues: 'None',
      improvement: 'Name the branches.',
      explanation: 'Matches the observation.',
      sourceId: 'S1',
      learnerQuote: 'visits',
    };
    const body = p.request.url.endsWith('/embed')
      ? {
          embeddings: JSON.parse(p.request.postData).input.map(() => [
            0.6, 0.8,
          ]),
        }
      : p.request.url.endsWith('/tags')
        ? {
            models: [
              { name: 'fixture', digest: 'abc', size: 1024 },
              { name: 'nomic-embed-text:latest', digest: 'embed', size: 2048 },
            ],
          }
        : {
            done: true,
            done_reason: 'stop',
            message: {
              content: JSON.stringify(
                p.request.postData.includes('previousQuestions')
                  ? {
                      claims: [
                        {
                          point:
                            'The orchard observations compare visits with fruit set.',
                          refs: ['P1', 'P2'],
                        },
                      ],
                      limitation: 'Two excerpts.',
                    }
                  : p.request.postData.includes('learnerAnswer')
                    ? f
                    : a,
              ),
            },
          };
    void send('Fetch.fulfillRequest', {
      requestId: p.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Access-Control-Allow-Origin', value: '*' },
      ],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  };
  await send('Fetch.enable', {
    patterns: [{ urlPattern: 'http://127.0.0.1:11434/*' }],
  });
  await click('Analyze with AI');
  await until(() => run("!!document.querySelector('.practice-card textarea')"));
  await run(
    "(()=>{const t=document.querySelector('.practice-card textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Bee visits varied.');t.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await click('Check my answer');
  await until(() => run("!!document.querySelector('.feedback-card')"));
  await until(() =>
    run(
      "chrome.storage.local.get(null).then(d=>Object.values(d).some(r=>r.kind==='assessment'))",
    ),
  );
  await click('Home');
  await click('Start review');
  await click('Reveal and self-assess');
  await click('Partially Correct');
  await click('End session');
  const { identifyArticle } = await import('../lib/library-model.ts');
  const second = await identifyArticle({
    title: 'Fruit set measurement',
    url: 'https://example.org/fruit',
    text: 'Fruit set is measured as the fraction of tagged blossoms developing fruit. Measuring fruit set on the same orchard branches permits comparison with bee visits.',
    truncated: false,
  });
  await run(
    "chrome.storage.local.get('pki.library').then(async d=>{const lib=d['pki.library'];lib.articles.push(" +
      JSON.stringify(second) +
      ');lib.links.push({articleId:' +
      JSON.stringify(second.id) +
      ",spaceId:'a',note:''});await chrome.storage.local.set({'pki.library':lib})})",
  );
  await click('Spaces');
  await until(() =>
    run(
      '!!document.querySelector(\'[data-view=spaces] .card label textarea[maxlength="600"]\')',
    ),
  );
  await run(
    "(()=>{const t=[...document.querySelectorAll('[data-view=spaces] textarea')].at(-1);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'How do bee visits relate to fruit set?');t.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await click('Ask space');
  await until(() => run("document.body.innerText.includes('Two excerpts.')"));
  await run(
    "(()=>{const e=[...document.querySelectorAll('summary')].find(el=>el.innerText==='Cross-article insights');e.click()})()",
  );
  await click('Explore connections');
  await until(() =>
    run(
      "chrome.storage.local.get('pki.knowledge.v1').then(d=>d['pki.knowledge.v1'].turns.length===2)",
    ),
  );
  await click('Settings');
  await click('Update index');
  await until(() => run("document.body.innerText.includes('Index updated.')"));
  const indexed = hits;
  await click('Update index');
  await until(() => run("document.body.innerText.includes('Index updated.')"));
  assert.equal(
    hits,
    indexed + 1,
    'second index refresh should only discover the model',
  );
  await run(
    "chrome.storage.local.set({'pki.ai.settings':{enabled:false,modelName:'fixture'}})",
  );
  const total = hits;
  await send('Page.reload');
  await until(() =>
    run(
      "(()=>{const b=[...document.querySelectorAll('[data-view=home] [data-article-id]')].find(b=>b.innerText.includes('Orchard'));if(!b)return false;b.click();return true})()",
    ),
  );
  await click('Open saved analysis');
  await until(() =>
    run(
      "document.querySelector('.practice-card textarea')?.value==='Bee visits varied.' && !!document.querySelector('.feedback-card')",
    ),
  );
  assert.equal(hits, total);
  await click('Spaces');
  await until(() =>
    run(
      "document.querySelector('.study-counts')?.textContent.includes('Answer checks1')",
    ),
  );
  await click('Settings');
  await send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: root,
  });
  await click('Export backup');
  const { readdir } = await import('node:fs/promises');
  const file = path.join(
    root,
    await until(async () =>
      (await readdir(root)).find((n) => n.endsWith('.json')),
    ),
  );
  const exported = JSON.parse(await readFile(file));
  assert.equal(exported.study.length, 3);
  assert.equal(exported.library.articles.length, 2);
  assert.equal(exported.knowledge.turns.length, 2);
  assert.equal(exported.knowledge.ratings.length, 1);
  await run('chrome.storage.local.clear()');
  await send('Page.reload');
  await until(() => run("!!document.querySelector('nav')"));
  await click('Settings');
  async function restore() {
    const doc = await send('DOM.getDocument');
    const node = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: 'input[type=file]',
    });
    await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [file] });
  }
  await restore();
  await until(() =>
    run(
      "chrome.storage.local.get(null).then(d=>Object.values(d).some(r=>r.kind==='assessment'))",
    ),
  );
  await restore();
  await until(() =>
    run("document.body.innerText.includes('0 records restored')"),
  );
  console.log(
    'Browser fixture passed: capture, save, analyze, recall, daily revision, multi-article insights and chat, incremental indexing, offline reopen and backup restore.',
  );
} finally {
  ws?.close();
  child.kill();
  server.close();
}
