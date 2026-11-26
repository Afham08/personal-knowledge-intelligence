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
const root = process.env.PKI_EDUCATION_REOPEN || await mkdtemp(path.join(tmpdir(), 'pki-shared-reader-')),
  ext = path.join(root, 'extension'),
  profile = path.join(root, 'profile');
if(!process.env.PKI_EDUCATION_REOPEN)await cp(process.env.PKI_PACKAGED_DIR || '.output/chrome-mv3', ext, { recursive: true });
const manifest = path.join(ext, 'manifest.json'),
  data = JSON.parse(await readFile(manifest));
if (!process.env.PKI_PACKAGED_DIR && !process.env.PKI_EDUCATION_TEST) {
data.host_permissions = ['http://127.0.0.1/*', 'http://127.0.0.1:11434/*'];
data.optional_host_permissions = [];
await writeFile(manifest, JSON.stringify(data));
}
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
      await until(async () => {try {const info=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');await fetch('http://127.0.0.1:'+info.split('\n')[0]+'/json/version');return info;} catch {return '';}})
    ).split('\n')[0],
    base = 'http://127.0.0.1:' + port;
  const worker = await until(async () => {
    const targets=await (await fetch(base+'/json/list')).json();
    for(const t of targets.filter(t=>t.type==='service_worker'&&t.url.endsWith('/background.js'))){
      const sock=new WebSocket(t.webSocketDebuggerUrl);
      try{
        await new Promise((resolve,reject)=>{sock.onopen=resolve;sock.onerror=reject;});
        const name=new Promise(resolve=>{sock.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1)resolve(m.result?.result?.value);};});
        sock.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'chrome.runtime.getManifest().name',returnByValue:true}}));
        if(await name==='Personal Knowledge Intelligence')return t;
      }finally{sock.close();}
    }
  });
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
  async function send(method, params = {}) {
    const n = ++id,
      p = new Promise((r) => calls.set(n, r));
    ws.send(JSON.stringify({ id: n, method, params }));
    const m = await p;
    calls.delete(n);
    if (m.error) throw Error(JSON.stringify(m.error));
    return m.result;
  }
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
  await until(() => run("!!document.querySelector('nav')")).catch(async e=>{throw Error(e.message+' '+await run("JSON.stringify([location.href,document.title,document.body.innerText.slice(0,350)])"));});
  if(process.env.PKI_EDUCATION_TEST){
    const {checkEducation}=await import('./test-education.mjs');
    await checkEducation({run,click,until,send,reopen:!!process.env.PKI_EDUCATION_REOPEN});
    if(!process.env.PKI_EDUCATION_REOPEN){
      const closed=new Promise(resolve=>child.once('exit',resolve));void send('Browser.close');await closed;
      const next=spawn(process.execPath,['scripts/test-browser.mjs'],{env:{...process.env,PKI_EDUCATION_REOPEN:root},stdio:'inherit',windowsHide:true});
      assert.equal(await new Promise(resolve=>next.once('exit',resolve)),0);
    }
  }else if(process.env.PKI_PACKAGED_DIR){
    await click('Settings');
    assert.equal(await run("chrome.runtime.getManifest().version_name"),'0.3.0-beta.2');
    assert.equal(await run("chrome.runtime.getManifest().host_permissions"),undefined);
    assert.equal(await run("document.body.innerText.includes('Enable local AI')"),true);
    console.log('Unmodified packaged extension installed and loaded Settings with AI disabled.');
  }else{
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
  await until(() => run("!!document.querySelector('nav')")).catch(async e=>{throw Error(e.message+' '+await run("JSON.stringify([location.href,document.title,document.body.innerText.slice(0,350)])"));});
  await click('Settings');
  async function restore() {
    const doc = await send('DOM.getDocument');
    const node = await send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '[data-view=settings] input[type=file]',
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
  await click('Home');
  async function disclose(label){
    await run("(()=>{const s=[...document.querySelectorAll('summary')].find(s=>s.textContent.trim()==="+JSON.stringify(label)+"&&s.checkVisibility());if(!s)throw Error('Missing disclosure');s.parentElement.open=true})()");
  }
  await disclose('Highlights and related knowledge');
  await run("chrome.tabs.query({active:true,currentWindow:true}).then(([t])=>chrome.scripting.executeScript({target:{tabId:t.id},func:()=>{const text=document.querySelector('article p').firstChild;const r=new Range();r.setStart(text,0);r.setEnd(text,18);getSelection().removeAllRanges();getSelection().addRange(r)}}))");
  await click('Save selected text');
  await until(()=>run("document.body.innerText.includes('1 located')"));
  await click('Find related knowledge');
  await until(()=>run("document.body.innerText.includes('related passages.')"));
  await click('Settings');await select('[data-view=settings] label.card select','dark');
  await until(()=>run("document.documentElement.dataset.theme==='dark'"));
  await disclose('Storage and Markdown export');await click('Export Markdown ZIP');
  await until(async()=>(await readdir(root)).includes('PKI-Markdown.zip'));
  await click('Library');
  if(!await run("!![...document.querySelectorAll('summary')].find(s=>s.checkVisibility()&&s.textContent==='Import local PDF')")){
    await click('Library list');
  }
  await disclose('Import local PDF');
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const content='BT /F1 14 Tf 40 440 Td (Field report on orchard pollination) Tj ET';
  objects.push('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
  const xref=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  const pdfPath=path.join(root,'Field report.pdf');await writeFile(pdfPath,pdf);
  const dom=await send('DOM.getDocument');const input=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'[data-view=library] input[type=file]'});
  const invalid=path.join(root,'damaged.pdf');await writeFile(invalid,'this file contains no PDF');
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[invalid]});
  await until(()=>run("!!document.querySelector('[data-view=library] [role=alert]')"));
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[pdfPath]});
  await until(()=>run("chrome.storage.local.get('pki.library').then(d=>d['pki.library'].articles.some(a=>a.pages?.[0]?.page===1&&a.text.includes('orchard pollination')))"));
  await click('Spaces');await disclose('Knowledge graph');await until(()=>run("!!document.querySelector('.knowledge-graph circle')"));
  if(process.env.PKI_GRAPH_SCREENSHOT){
    await send('Emulation.setDeviceMetricsOverride',{width:396,height:800,deviceScaleFactor:1,mobile:false});
    await run("document.querySelector('.knowledge-graph').closest('details').scrollIntoView()");
    const capture=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(process.env.PKI_GRAPH_SCREENSHOT,Buffer.from(capture.data,'base64'));
  }
  await click('Settings');await disclose('Storage and Markdown export');
  const exportedPdfId=await run("chrome.storage.local.get('pki.library').then(d=>d['pki.library'].articles.find(a=>a.pages).id)");
  await select('[data-view=settings] details.card label:nth-of-type(2) select',exportedPdfId);
  await run("window.confirm=()=>true");
  await click('Delete selected resource');
  await until(()=>run("chrome.storage.local.get('pki.library').then(d=>!d['pki.library'].articles.some(a=>a.pages)&&d['pki.library'].links.every(l=>d['pki.library'].articles.some(a=>a.id===l.articleId)))"));
  console.log('Browser passed real selection capture and CSS restoration, related search, appearance, Markdown ZIP export, bundled PDF extraction and graph rendering.');
  console.log(
    'Browser fixture passed: capture, save, analyze, recall, daily revision, multi-article insights and chat, incremental indexing, offline reopen and backup restore.',
  );
  }
} finally {
  ws?.close();
  child.kill();
  server.close();
}
