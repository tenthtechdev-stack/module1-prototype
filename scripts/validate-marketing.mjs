import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { spawn } from 'node:child_process';
import { launchBrowser, delay } from './marketing-browser.mjs';

const source = await readFile('src/content/marketing/pages.ts','utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { publicPaths } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const base = process.env.MARKETING_BASE_URL ?? 'http://127.0.0.1:3002';
const required = ['/', '/marketplace-profitability','/product-profitability','/cogs-management','/product-groups','/copilot','/marketplace-analytics','/integrations/amazon','/integrations/ebay','/integrations/temu','/pricing','/security','/about','/contact'];
const output = 'artifacts/public-website';
await mkdir(`${output}/browser`,{recursive:true});
let ownedServer;
try { const response=await fetch(base); if(!response.ok)throw new Error('Preview not ready'); }
catch {
  const url=new URL(base);
  if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Start the target server before running marketing QA.');
  ownedServer=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',url.port||'3002'],{windowsHide:true,stdio:'ignore'});
  let ready=false;
  for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await delay(250);}
  if(!ready){ownedServer.kill();throw new Error('The production preview could not start. Run npm run build first.');}
}
const browser = await launchBrowser();
const checks = []; const pages = []; const evidence = []; const titles = new Set(); const descriptions = new Set(); const internalTargets = new Set();
function check(passed, message) { checks.push({passed:!!passed,message}); if (!passed) console.error(`FAIL: ${message}`); }
async function capture(name,selector) { const file = `${output}/browser/${name}.png`; await browser.capture(file,selector); evidence.push({name,file,url:await browser.evaluate('location.href')}); }
async function inspectPage(path) {
  const response = await fetch(`${base}${path}`); const html = await response.text();
  check(response.status === 200,`${path}: HTTP 200`);
  check(/<h1(?:\s|>)/.test(html),`${path}: H1 delivered in server HTML`);
  await browser.navigate(`${base}${path}`);
  const state = await browser.evaluate(`(() => {
    const main=document.querySelector('main');
    const schema=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>JSON.parse(s.textContent));
    return {title:document.title,description:document.querySelector('meta[name="description"]')?.content,canonical:document.querySelector('link[rel="canonical"]')?.href,ogTitle:document.querySelector('meta[property="og:title"]')?.content,ogDescription:document.querySelector('meta[property="og:description"]')?.content,ogImage:document.querySelector('meta[property="og:image"]')?.content,twitter:document.querySelector('meta[name="twitter:card"]')?.content,h1:[...document.querySelectorAll('h1')].map(e=>e.textContent),schema,links:[...document.querySelectorAll('a[href]')].map(e=>e.getAttribute('href')),images:[...document.querySelectorAll('img')].map(e=>({alt:e.getAttribute('alt'),width:e.width,height:e.height,loaded:e.complete&&e.naturalWidth>0,loading:e.loading})),text:main?.innerText,faqs:[...main.querySelectorAll('.m-faq details')].map(e=>({question:e.querySelector('summary').textContent.replace(/\\+$/,'').trim(),answer:e.querySelector('p').textContent})),overflow:document.documentElement.scrollWidth>innerWidth+1,prototype:!!document.querySelector('.prototype-tools,.sidebar,.app-header'),mainCount:document.querySelectorAll('main').length,robots:document.querySelector('meta[name="robots"]')?.content};
  })()`);
  check(state.title && !titles.has(state.title),`${path}: unique title`); titles.add(state.title);
  check(state.description && !descriptions.has(state.description),`${path}: unique description`); descriptions.add(state.description);
  check(state.canonical && new URL(state.canonical).pathname === path && !new URL(state.canonical).search,`${path}: canonical route without query`);
  check(state.ogTitle === state.title && state.ogDescription === state.description && !!state.ogImage && state.twitter === 'summary_large_image',`${path}: complete matching social metadata`);
  check(state.h1.length === 1 && state.h1[0].length > 10 && state.mainCount === 1,`${path}: one meaningful H1 and main landmark`);
  check(state.robots?.includes('index') && !state.robots?.includes('noindex'),`${path}: indexable`);
  check(!state.prototype,`${path}: no private shell or prototype controls`);
  check(state.images.every(image=>image.alt!==null && image.width>0 && image.height>0),`${path}: image alt attributes and reserved dimensions`);
  check(state.images.filter(image=>image.alt).every(image=>image.alt.length>15),`${path}: descriptive product image alternatives`);
  check(!state.overflow,`${path}: no desktop overflow`);
  check(!/lorem ipsum|feature title here|description goes here|\bProduct 1\b|Test Company|Customer A|10,000 customers|99\.99% uptime|SOC 2 certified|G2 4\.9|TikTok|Shopify|Walmart|Trustpilot/i.test(state.text),`${path}: prohibited copy and unsupported marketplace check`);
  check(!/[£$€]\s*\d+[\d.,]*\s*(?:\/\s*(?:mo|month|year)|per\s+(?:month|year))/i.test(state.text),`${path}: no invented recurring price`);
  const nodes = state.schema.flatMap(data=>data['@graph']??[data]);
  check(state.schema.length>0 && state.schema.every(data=>data['@context']==='https://schema.org'),`${path}: parseable Schema.org graph`);
  check(!nodes.some(node=>node.aggregateRating || node.review || node.offers || /Review|Rating/.test(node['@type'])),`${path}: no fabricated structured offers or reviews`);
  const faq=nodes.find(node=>node['@type']==='FAQPage');
  check(faq?.mainEntity?.length === state.faqs.length && state.faqs.every(item=>faq.mainEntity.some(q=>q['@type']==='Question'&&q.name===item.question&&q.acceptedAnswer?.['@type']==='Answer'&&q.acceptedAnswer.text===item.answer)),`${path}: FAQ schema matches rendered questions and answers`);
  check(path==='/' ? nodes.some(n=>n['@type']==='Organization'&&n.name==='Stock Supplies') : nodes.some(n=>n['@type']==='BreadcrumbList'&&n.itemListElement.every((item,i)=>item.position===i+1&&item.item)),`${path}: correct organization or breadcrumb shape`);
  check(state.links.includes('/auth/register')&&state.links.includes('/auth/sign-in'),`${path}: approved account CTA routes`);
  check(state.links.filter(href=>required.includes(href)).length>=5,`${path}: public internal links`);
  for (const href of state.links) if (href.startsWith('/')) internalTargets.add(href);
  const slug=path==='/'?'homepage-desktop':path.slice(1).replaceAll('/','-');
  await capture(slug);
  pages.push({path,title:state.title,description:state.description,canonical:state.canonical,h1:state.h1[0],wordCount:state.text.split(/\s+/).length,images:state.images.length,structuredTypes:nodes.map(n=>n['@type'])});
}
try {
  await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__marketingMetrics={cls:0,lcp:0,longTasks:0};new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__marketingMetrics.cls+=e.value}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())window.__marketingMetrics.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>window.__marketingMetrics.longTasks+=l.getEntries().length).observe({type:'longtask',buffered:true});`});
  await browser.viewport(1440,1000);
  check(required.every(path=>publicPaths.includes(path)), 'Content registry covers every required public route');
  for (const path of required) { await inspectPage(path); console.log(`Checked ${path}`); }
  const sitemapResponse=await fetch(`${base}/sitemap.xml`); const sitemap=await sitemapResponse.text();
  const sitemapURLs=await browser.evaluate(`(() => {const doc=new DOMParser().parseFromString(${JSON.stringify(sitemap)},'application/xml');return [...doc.querySelectorAll('url>loc')].map(n=>n.textContent)})()`);
  check(sitemapResponse.status===200&&sitemapURLs.length===required.length&&required.every(path=>sitemapURLs.some(url=>new URL(url).pathname===path)),'Sitemap contains exactly the required public pages');
  check(sitemapURLs.every(url=>!/^\/(o|auth|onboarding|platform|dev)(\/|$)/.test(new URL(url).pathname)),'Sitemap excludes private application and development routes');
  const robotsResponse=await fetch(`${base}/robots.txt`); const robots=await robotsResponse.text();
  check(robotsResponse.status===200&&/Allow: \/\s/.test(robots)&&!/Disallow: \/\s/.test(robots)&&['/auth','/onboarding','/o/','/platform'].every(path=>robots.includes(`Disallow: ${path}`))&&robots.includes('Sitemap:'),'Robots permits public pages and disallows private paths');
  await writeFile(`${output}/sitemap.xml`,sitemap);await writeFile(`${output}/robots.txt`,robots);
  for (const href of internalTargets) {
    const url=new URL(href,base); const response=await fetch(url); check(response.status===200,`Link target resolves: ${href}`);
    if(url.hash){await browser.navigate(url.origin+url.pathname);check(await browser.evaluate(`!!document.getElementById(${JSON.stringify(url.hash.slice(1))})`),`Anchor target exists: ${href}`);}
  }
  await browser.navigate(`${base}/`);
  for (const id of ['hero','explainability','marketplaces','cogs','product-groups','copilot','multi-company','start']) await capture(`home-${id}`,`#${id}`);
  // Keyboard-operated desktop menu and FAQ; both are native/Radix accessible controls.
  await browser.evaluate(`window.scrollTo(0,0);document.querySelector('.m-nav-trigger').focus()`);
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(100);
  check(await browser.evaluate(`!!document.querySelector('[role=menu]')`),'Desktop navigation opens by keyboard');
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  check(await browser.evaluate(`document.activeElement.classList.contains('m-nav-trigger')`),'Desktop menu restores trigger focus');
  await delay(250);await browser.evaluate(`document.querySelector('.m-faq summary').focus()`);await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await delay(100);
  check(await browser.evaluate(`document.querySelector('.m-faq details').open`),'FAQ opens by keyboard');
  for(const width of [1280,834,390]) {await browser.viewport(width,width===390?844:1000,width===390);await browser.navigate(`${base}/`);check(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Homepage no overflow at ${width}px`);await capture(`homepage-${width}`);}
  await browser.evaluate(`document.querySelector('.m-mobile-toggle').click()`);await delay(200);await capture('mobile-navigation','.m-mobile-drawer');
  check(await browser.evaluate(`!!document.querySelector('[role=dialog]') && document.querySelector('[role=dialog]').contains(document.activeElement)`),'Mobile drawer opens with focus inside');
  for(let i=0;i<35;i++){await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});check(await browser.evaluate(`document.querySelector('[role=dialog]').contains(document.activeElement)`),`Mobile focus remains trapped (Tab ${i+1})`);}
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(150);
  check(await browser.evaluate(`!document.querySelector('[role=dialog]')&&document.activeElement.classList.contains('m-mobile-toggle')`),'Mobile Escape closes drawer and restores focus');
  await browser.evaluate(`document.querySelector('.m-mobile-toggle').click()`);await delay(150);await browser.evaluate(`document.querySelector('.m-mobile-drawer a[href="/product-groups"]').click()`);await browser.waitFor(`location.pathname==='/product-groups'&&!document.querySelector('[role=dialog]')`);check(true,'Mobile navigation link changes route and closes drawer');
  for(const path of required.slice(1)){await browser.navigate(`${base}${path}`);check(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`${path}: no mobile overflow`);}
  await browser.navigate(`${base}/product-groups`);await capture('mobile-feature-page');
  await browser.navigate(`${base}/contact`);check(await browser.evaluate(`!document.querySelector('form').checkValidity()`),'Empty contact form is invalid');
  await browser.evaluate(`(() => {const form=document.querySelector('form');const values={name:'Website Reviewer',email:'reviewer@example.com',company:'Commerce Review',role:'Finance & Accounts',accounts:'3',message:'Reviewing marketplace cost coverage and access requirements.'};for(const [name,value]of Object.entries(values)){form.elements.namedItem(name).value=value;}form.querySelector('input[type=checkbox]').checked=true;form.requestSubmit()})()`);
  await browser.waitFor(`document.querySelector('.m-form-success')`);check(await browser.evaluate(`JSON.parse(localStorage.getItem('stock-supplies:marketing-enquiry')).accounts===3`),'Contact captures validated enquiry locally');await capture('contact-local-success');
  await browser.evaluate(`Storage.prototype.setItem=function(){throw new DOMException('Storage disabled','QuotaExceededError')};document.querySelector('form').requestSubmit()`);await browser.waitFor(`document.querySelector('.m-form-failure')`);check(await browser.evaluate(`document.querySelector('input[name=name]').value==='Website Reviewer'`),'Contact storage failure preserves entries for retry');await capture('contact-local-failure');
  // Reset isolated browser test data; no user storage is used by this browser profile.
  await browser.navigate(`${base}/contact`);await browser.evaluate(`localStorage.removeItem('stock-supplies:marketing-enquiry')`);
  await browser.viewport(1440,1000);await browser.navigate(`${base}/`);await browser.evaluate(`document.querySelector('[data-cta="hero-start-test-plan"]').click()`);await browser.waitFor(`location.pathname==='/auth/register'&&document.querySelector('form')`);check(true,'Primary CTA opens the existing registration form');
  await browser.navigate(`${base}/`);await browser.evaluate(`document.querySelector('[data-cta="header-sign-in"]').click()`);await browser.waitFor(`location.pathname==='/auth/sign-in'&&document.querySelector('form')`);check(true,'Sign-in CTA opens the existing sign-in form');
  for(const path of ['/auth/sign-in','/auth/register','/onboarding','/o/stock-supplies/dashboard','/platform/dashboard']) {const response=await fetch(`${base}${path}`);check(response.headers.get('x-robots-tag')?.includes('noindex'),`${path}: X-Robots-Tag noindex`);await browser.navigate(`${base}${path}`,`document.querySelector('h1')||document.querySelector('.app-header')`);check(await browser.evaluate(`document.querySelector('meta[name=robots]')?.content.includes('noindex')`),`${path}: noindex metadata`);}
  const missing=await fetch(`${base}/not-a-public-page`);check(missing.status===404,'Unknown public URL returns HTTP 404');await browser.viewport(1440,1000);await browser.navigate(`${base}/not-a-public-page`);check(await browser.evaluate(`document.body.innerText.includes('This page doesn’t add up.')&&!document.querySelector('.sidebar')`),'Public 404 is branded and excludes tenant shell');await capture('public-404');
  await browser.send('Network.setCacheDisabled',{cacheDisabled:true});await browser.viewport(1440,1000);await browser.navigate(`${base}/`);await delay(1500);
  const performance=await browser.evaluate(`({metrics:window.__marketingMetrics,resources:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script'||r.initiatorType==='img').map(r=>({name:r.name,bytes:r.transferSize,duration:r.duration,type:r.initiatorType})),images:[...document.images].map(i=>({src:i.currentSrc,complete:i.complete,naturalWidth:i.naturalWidth}))})`);
  check(performance.metrics.cls<0.1,'Representative desktop CLS below 0.1');
  const allImagesLoaded=await browser.evaluate(`Promise.all([...document.images].map(async image=>{image.loading='eager';try{await image.decode();return image.naturalWidth>0}catch{return false}})).then(results=>results.every(Boolean))`);
  check(allImagesLoaded,'Homepage screenshots load successfully when requested (including lazy images)');
  check(browser.issues.length===0,'No browser runtime exceptions during public and conversion QA');
  await writeFile(`${output}/performance.json`,JSON.stringify(performance,null,2));
} finally {
  await writeFile(`${output}/seo-browser-report.json`,JSON.stringify({base,checks,summary:{passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length},pages,evidence,runtimeErrors:browser.issues},null,2));
  await browser.close();
  ownedServer?.kill();
}
console.log(`Marketing validation: ${checks.filter(c=>c.passed).length} passed, ${checks.filter(c=>!c.passed).length} failed. ${evidence.length} screenshots.`);
if(checks.some(c=>!c.passed))process.exitCode=1;
