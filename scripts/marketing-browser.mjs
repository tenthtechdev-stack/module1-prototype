import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const delay = (ms) => new Promise((done) => setTimeout(done, ms));
export async function launchBrowser() {
  const profile = await mkdtemp(join(tmpdir(), 'stock-marketing-browser-'));
  const port = 9500 + Math.floor(Math.random() * 300);
  const chrome = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }); if (response.ok) { target = await response.json(); break; } } catch {}
    await delay(150);
  }
  if (!target) { chrome.kill(); throw new Error('Chrome could not start.'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let id = 0; const issues = [];
  ws.addEventListener('message', (event) => { const data = JSON.parse(event.data); if (data.id) { const p = pending.get(data.id); if (!p) return; clearTimeout(p.timer); pending.delete(data.id); if (data.error) p.reject(new Error(data.error.message)); else p.done(data.result); } else if (data.method === 'Runtime.exceptionThrown') issues.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((done, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timed out: ${method}`)); }, 90000); pending.set(n, { done, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const evaluate = async (expression) => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
  const waitFor = async (expression, timeout = 60000) => { const start = Date.now(); while (Date.now() - start < timeout) { try { if (await evaluate(`Boolean(${expression})`)) return; } catch {} await delay(150); } throw new Error(`Condition timed out: ${expression}`); };
  const viewport = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  const navigate = async (url, ready = 'document.querySelector("h1")') => { await send('Page.navigate', { url }); await waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && (${ready})`); await evaluate('document.fonts.ready'); await delay(300); };
  const capture = async (path, selector) => { await evaluate(`Promise.all([...document.images].map(image=>{image.loading='eager';return image.decode().catch(()=>{})}))`); let clip; if (selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`); await delay(100); clip = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`); } const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : { clip: await evaluate('({x:0,y:0,width:innerWidth,height:document.documentElement.scrollHeight,scale:1})') }) }); await writeFile(path, Buffer.from(result.data, 'base64')); };
  return { send, evaluate, waitFor, viewport, navigate, capture, issues, close: async () => { ws.close(); chrome.kill(); await delay(500); const checked = resolve(profile); if (!checked.startsWith(resolve(tmpdir()) + '\\') || !checked.includes('stock-marketing-browser-')) throw new Error('Unexpected browser profile path'); await rm(checked, { recursive: true, force: true, maxRetries: 4, retryDelay: 500 }).catch(() => {}); } };
}
