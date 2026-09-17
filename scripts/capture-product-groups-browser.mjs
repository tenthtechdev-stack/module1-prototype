import { spawn } from 'node:child_process';
import { once as onceEvent } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.PRODUCT_GROUPS_BASE_URL ?? 'http://localhost:3000';
const outputDir = resolve('artifacts/phase-5-product-groups/browser');
const port = 9300 + Math.floor(Math.random() * 300);
const groupPath = '/o/stock-supplies/cogs/groups/grp-disposable-gloves';
const captureMode = process.env.PRODUCT_GROUPS_CAPTURE_MODE ?? 'main';

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const normaliseText = (value) => value.replace(/\s+/g, ' ').trim();

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Chrome DevTools did not become ready: ${lastError ?? 'timeout'}`);
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;

  const ready = new Promise((resolveReady, rejectReady) => {
    socket.addEventListener('open', resolveReady, { once: true });
    socket.addEventListener('error', rejectReady, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }

    const methodListeners = listeners.get(message.method);
    if (!methodListeners) return;
    for (const listener of [...methodListeners]) listener(message.params);
  });

  function on(method, listener) {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(listener);
    return () => listeners.get(method)?.delete(listener);
  }

  function once(method, timeoutMs = 15_000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timeout = setTimeout(() => {
        listeners.get(method)?.delete(onEvent);
        rejectEvent(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const onEvent = (params) => {
        clearTimeout(timeout);
        listeners.get(method)?.delete(onEvent);
        resolveEvent(params);
      };
      on(method, onEvent);
    });
  }

  async function send(method, params = {}) {
    await ready;
    const id = ++sequence;
    const response = new Promise((resolveResponse, rejectResponse) => {
      pending.set(id, { resolve: resolveResponse, reject: rejectResponse });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  return { on, once, ready, send, socket };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const profileDir = await mkdtemp(join(tmpdir(), 'stock-supplies-groups-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  let chromeErrors = '';
  chrome.stderr.on('data', (chunk) => { chromeErrors += chunk.toString(); });
  const pageIssues = [];
  const checks = [];
  const captures = [];
  let browserCdp;
  let pageCdp;

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: 'PUT' });
    if (!targetResponse.ok) throw new Error(`Could not create browser target: ${targetResponse.status}`);
    const target = await targetResponse.json();
    pageCdp = connectCdp(target.webSocketDebuggerUrl);
    await pageCdp.ready;
    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('Log.enable');
    await pageCdp.send('Network.enable');

    pageCdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      pageIssues.push(`Runtime exception: ${exceptionDetails?.exception?.description ?? exceptionDetails?.text ?? 'unknown'}`);
    });
    pageCdp.on('Log.entryAdded', ({ entry }) => {
      if (entry?.level === 'error') pageIssues.push(`Browser log: ${entry.text}${entry.url ? ` · ${entry.url}` : ''}`);
    });
    pageCdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type === 'error' || type === 'assert') {
        pageIssues.push(`Console ${type}: ${args.map((item) => item.value ?? item.description ?? '').join(' ')}`);
      }
    });

    async function evaluate(expression) {
      const response = await pageCdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
      }
      return response.result.value;
    }

    async function waitFor(expression, description, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      let lastError;
      while (Date.now() < deadline) {
        try {
          if (await evaluate(expression)) {
            checks.push({ description, passed: true, url: await evaluate('location.href') });
            return;
          }
        } catch (error) {
          lastError = error;
        }
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ''}`);
    }

    async function settle() {
      await evaluate('document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 500)))');
    }

    async function setViewport(width, height, mobile = false) {
      await pageCdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
        screenWidth: width,
        screenHeight: height,
      });
    }

    async function navigate(path, expectedText) {
      const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
      const loaded = pageCdp.once('Page.loadEventFired');
      await pageCdp.send('Page.navigate', { url });
      await loaded;
      try {
        await waitFor(
          `document.readyState === 'complete' && document.body && document.body.innerText.includes(${JSON.stringify(expectedText)})`,
          `page text “${expectedText}”`,
          20_000,
        );
      } catch (error) {
        await writeFile(join(outputDir, 'navigation-failure.txt'), `${await evaluate('location.href')}\n\n${await evaluate('document.body?.innerText ?? ""')}`);
        await capture('navigation-failure.png');
        throw error;
      }
      await waitFor(
        `!document.querySelector('[aria-busy="true"]')`,
        'page loading state to finish',
        20_000,
      );
      await settle();
      await evaluate('window.scrollTo(0, 0)');
    }

    async function capture(name, focusSelector) {
      if (focusSelector) {
        await evaluate(`document.querySelector(${JSON.stringify(focusSelector)})?.scrollIntoView({ block: 'center', inline: 'nearest' })`);
        await delay(250);
      }
      const dimensions = await evaluate('({ width: innerWidth, height: innerHeight, scrollX, scrollY })');
      const screenshot = await pageCdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        fromSurface: true,
      });
      const filePath = join(outputDir, name);
      await writeFile(filePath, Buffer.from(screenshot.data, 'base64'));
      captures.push({ name, filePath, url: await evaluate('location.href'), dimensions });
    }

    async function clickText(text, selector = 'button, a, summary') {
      const clicked = await evaluate(`(() => {
        const normalise = value => value.replace(/\\s+/g, ' ').trim();
        const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .find(element => normalise(element.textContent || '') === ${JSON.stringify(normaliseText(text))});
        if (!target) return false;
        target.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`Could not find control with text “${text}”`);
    }

    async function setField(labelText, value) {
      const changed = await evaluate(`(() => {
        const normalise = value => value.replace(/\\s+/g, ' ').trim();
        const label = [...document.querySelectorAll('label')]
          .find(element => normalise(element.textContent || '').startsWith(${JSON.stringify(normaliseText(labelText))}));
        const control = label?.querySelector('input, textarea, select')
          ?? (label?.htmlFor ? document.getElementById(label.htmlFor) : null);
        if (!control) return false;
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value');
        descriptor?.set?.call(control, ${JSON.stringify(value)});
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (!changed) throw new Error(`Could not find field labelled “${labelText}”`);
      await delay(100);
    }

    await setViewport(1440, 1100);

    if (captureMode === 'restricted') {
      await pageCdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { sessionStorage.setItem('stock-supplies:prototype-role', 'cost-user'); } catch {}`,
      });
      await navigate(groupPath, 'Product Group not found');
      await waitFor(
        `document.body.innerText.includes('This Group does not exist or falls outside your Company assignment.') && !document.body.innerText.includes('Shared purchasing basis for disposable glove pack sizes.')`,
        'non-disclosing Company-assignment deep-link denial',
      );
      await capture('restricted-role.png');
    } else {
    await navigate('/o/stock-supplies/cogs/groups', '3 matching records');
    await waitFor(
      `['Current Costs','Product Groups','Imports','Pending Approval'].every(text => document.body.innerText.includes(text))`,
      'canonical COGS sub-navigation',
    );
    await capture('product-groups-list.png');

    await waitFor(
      `document.body.innerText.includes('COPILOT SUGGESTION · NO CHANGES APPLIED') && document.body.innerText.includes('Copilot cannot create the Group')`,
      'Copilot suggestion-only guardrails',
    );
    await capture('copilot-suggestion.png', '.product-group-copilot-suggestion');

    await navigate('/o/stock-supplies/cogs/groups/new', 'Create Product Group');
    await waitFor(
      `['Group identity','Costing basis','Group members','Financial confirmation'].every(text => document.body.innerText.includes(text))`,
      'complete Product Group creation form',
    );
    await waitFor(
      `/\\d{2} Sep(?:t)? 2026/.test(document.querySelector('.ui-unambiguous-date-display')?.textContent ?? '') && !document.querySelector('.ui-unambiguous-date-display')?.textContent.includes('/')`,
      'unambiguous visible effective date with ISO-backed picker',
    );
    await capture('create-product-group.png');

    const selectedMember = await evaluate(`(() => {
      const target = document.querySelector('.product-group-product-picker button');
      if (!target) return false;
      target.click();
      return true;
    })()`);
    if (!selectedMember) throw new Error('No ungrouped Company Product was available for the live calculation');
    await waitFor(`document.body.innerText.includes('Live inherited-cost calculation')`, 'live inherited-cost calculation');
    const packInputLabel = await evaluate(`document.querySelector('.product-group-member-preview input[aria-label^="Pack Quantity for "]')?.getAttribute('aria-label')`);
    if (!packInputLabel) throw new Error('Pack Quantity input was not rendered');
    const packChanged = await evaluate(`(() => {
      const control = document.querySelector('.product-group-member-preview input[aria-label^="Pack Quantity for "]');
      if (!control) return false;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor.set.call(control, '25');
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!packChanged) throw new Error('Pack Quantity could not be changed');
    await waitFor(
      `document.querySelector('.product-group-member-preview')?.innerText.includes('£2.50')`,
      'single-boundary inherited COGS result',
    );
    await capture('live-inherited-calculation.png', '.product-group-member-preview');

    await navigate(groupPath, 'Cost-source precedence');
    await waitFor(
      `['Valid direct Product COGS','Inherited Product Group COGS','Missing'].every(text => document.body.innerText.includes(text))`,
      'deterministic cost-source precedence',
    );
    await capture('group-detail.png');

    await navigate(`${groupPath}?tab=members`, 'Effective members');
    await writeFile(join(outputDir, 'members-rendered-text.txt'), await evaluate('document.body.innerText'));
    await capture('members.png');
    await waitFor(
      `document.body.innerText.toLowerCase().includes('pack quantity') && document.body.innerText.toLowerCase().includes('effective period') && document.body.innerText.toLowerCase().includes('inherited from product group')`,
      'effective member rows',
    );
    const memberHref = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.product-group-table-scroll tbody tr')];
      const inherited = rows.find(row => row.querySelector('[data-label="COGS Source"]')?.textContent?.includes('Inherited'));
      return (inherited ?? rows.at(-1))?.querySelector('a.product-group-member-product')?.getAttribute('href');
    })()`);
    const memberSku = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.product-group-table-scroll tbody tr')];
      const inherited = rows.find(row => row.querySelector('[data-label="COGS Source"]')?.textContent?.includes('Inherited'));
      return (inherited ?? rows.at(-1))?.querySelector('td[data-label="Internal SKU"]')?.textContent?.trim();
    })()`);
    if (!memberHref || !memberSku) throw new Error('Could not resolve a member Product link and SKU');

    await navigate(`${groupPath}?tab=cost-history`, 'Cost History');
    await waitFor(
      `document.body.innerText.includes('01 Jan 2026') && document.body.innerText.includes('01 Apr 2026')`,
      'historical Group cost periods',
    );
    await capture('cost-history.png');

    await navigate(`${groupPath}?tab=profitability`, 'Member profitability');
    await waitFor(
      `document.querySelectorAll('.product-group-profit-metrics > *').length === 4 && document.querySelectorAll('.product-group-table-scroll tbody tr').length === 3`,
      'Group profitability reconciliation metrics',
    );
    await capture('profitability.png');

    await navigate(`${groupPath}?action=update-cost`, 'Current and new member impact');
    await setField('New Base Cost', '125.00');
    await waitFor(
      `document.querySelector('.product-group-impact-preview')?.innerText.includes('£125.00')`,
      'updated financial impact preview',
    );
    await capture('update-cost-impact.png', '.product-group-impact-preview');

    await navigate('/o/stock-supplies/products', 'View internal products');
    const columnsConfigured = await evaluate(`(() => {
      const menu = document.querySelector('.column-menu');
      if (!menu) return false;
      menu.open = true;
      for (const wanted of ['Product Group', 'Pack Quantity']) {
        const label = [...menu.querySelectorAll('label')].find(item => item.textContent.trim() === wanted);
        const checkbox = label?.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) checkbox.click();
      }
      menu.open = false;
      return true;
    })()`);
    if (!columnsConfigured) throw new Error('Products column menu was unavailable');
    await waitFor(
      `document.querySelector('th.column-productGroup') && document.querySelector('th.column-packQuantity') && document.body.innerText.toLowerCase().includes('inherited from product group')`,
      'Product Group, Pack Quantity and inherited COGS columns',
    );
    await evaluate(`(() => {
      const scroll = document.querySelector('.enterprise-grid .table-scroll');
      const target = document.querySelector('th.column-currentCogs');
      if (scroll && target) scroll.scrollLeft = Math.max(0, target.offsetLeft - 420);
    })()`);
    await delay(250);
    await capture('products-inherited-indicator.png', '.enterprise-grid');

    await navigate(memberHref, 'View Product Group');
    await waitFor(
      `Boolean(document.querySelector('.product-inherited-cost-card a[href*="/cogs/groups/"]')) && document.querySelector('.product-inherited-cost-card')?.textContent.includes('Inherited')`,
      'Product Costs inherited source card',
    );
    await writeFile(join(outputDir, 'product-inherited-card-text.txt'), await evaluate(`document.querySelector('.product-inherited-cost-card')?.innerText ?? ''`));
    await capture('product-detail-inherited-cost.png', '.product-inherited-cost-card');

    await navigate('/o/stock-supplies/cogs?action=paste', 'Paste from Excel');
    await setField('Spreadsheet rows', `SKU\tCost\tCurrency\tEffective Date\n${memberSku}\t112.00\tGBP\t2026-09-02`);
    await waitFor(`document.body.innerText.includes('1 data rows')`, 'one parsed grouped-Product row');
    await clickText('Analyse pasted rows');
    await waitFor(
      `location.pathname.includes('/cogs/import/') && document.body.innerText.includes('Confirm every source mapping')`,
      'import column-mapping route',
      20_000,
    );
    await clickText('Analyse and match Products');
    await waitFor(
      `document.body.innerText.includes('Explicit acknowledgement required') && document.body.innerText.includes('Acknowledge override and accept')`,
      'group-inheritance override warning and acknowledgement',
      20_000,
    );
    await capture('import-override-warning.png', '.cogs-group-override-review');

    await setViewport(390, 844, true);
    await navigate(groupPath, 'Cost-source precedence');
    await waitFor(
      `document.querySelector('[aria-label="Product Group detail sections"]')?.scrollWidth >= document.querySelector('[aria-label="Product Group detail sections"]')?.clientWidth`,
      'mobile Product Group tab layout',
    );
    await capture('mobile-group-detail.png');
    }

    const report = {
      generatedAt: new Date().toISOString(),
      browser: version.Browser,
      baseUrl,
      captureMode,
      captures,
      checks,
      pageIssues: [...new Set(pageIssues)],
    };
    const reportName = captureMode === 'restricted' ? 'restricted-browser-qa-report.json' : 'browser-qa-report.json';
    await writeFile(join(outputDir, reportName), `${JSON.stringify(report, null, 2)}\n`);

    browserCdp = connectCdp(version.webSocketDebuggerUrl);
    await browserCdp.ready;
    await browserCdp.send('Browser.close').catch(() => undefined);
  } finally {
    pageCdp?.socket.close();
    browserCdp?.socket.close();
    if (chrome.exitCode === null) {
      await Promise.race([onceEvent(chrome, 'exit'), delay(2_000)]);
    }
    if (chrome.exitCode === null && !chrome.killed) chrome.kill();
    await delay(300);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(profileDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 4) console.warn(`Temporary Chrome profile could not be removed: ${error}`);
        else await delay(300);
      }
    }
  }

  const relevantChromeErrors = chromeErrors
    .split(/\r?\n/)
    .filter((line) => line && !line.includes('DevTools listening on') && !line.includes('ERROR:components\\enterprise\\browser'));
  if (relevantChromeErrors.length) console.warn(relevantChromeErrors.join('\n'));
  console.log(`Captured ${captures.length} Product Groups browser states in ${outputDir}`);
}

await main();
