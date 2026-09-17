import { launchBrowser, delay } from './marketing-browser.mjs';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.MARKETING_BASE_URL ?? 'http://127.0.0.1:3001';
const browser = await launchBrowser();
const manifest = [];
await mkdir('artifacts/public-website/source-captures', { recursive: true });
async function capture(name, route, crop = { x:240,y:55,width:1200,height:760,scale:1 }) {
  await browser.evaluate(`(() => {const style=document.createElement('style');style.textContent='.prototype-tools,nextjs-portal{display:none!important}';document.head.append(style)})()`);
  await delay(400);
  const result = await browser.send('Page.captureScreenshot', { format:'png', clip:crop, captureBeyondViewport:true });
  const buffer = Buffer.from(result.data,'base64');
  await writeFile(`artifacts/public-website/source-captures/${name}.png`,buffer);
  const info = await sharp(buffer).resize(1200,760,{fit:'contain',background:'#f6f7f9'}).webp({quality:88}).toFile(`public/marketing/${name}.webp`);
  manifest.push({name,route,crop,width:info.width,height:info.height,bytes:info.size,source:'Fresh capture of existing application; only developer controls hidden.'});
  console.log(`Captured ${name}: ${info.size} bytes`);
}
try {
  await browser.viewport(1440,1000);
  await browser.navigate(`${base}/o/stock-supplies/dashboard`, 'document.body.innerText.includes("Net Profit") && !document.querySelector("[aria-busy=true]")');
  await capture('dashboard','/o/stock-supplies/dashboard');
  await browser.evaluate(`(() => {const e=document.querySelector('select[aria-label="Marketplace"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'amazon');e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await delay(1200);
  await capture('amazon','/o/stock-supplies/dashboard?marketplace=amazon');
  await browser.navigate(`${base}/o/stock-supplies/products/org-stock-supplies%3Aproduct-1-002`, 'document.body.innerText.includes("Current COGS") || document.body.innerText.includes("CURRENT COGS")');
  await capture('product','/o/stock-supplies/products/org-stock-supplies%3Aproduct-1-002',{x:264,y:104,width:1152,height:730,scale:1});
  await browser.navigate(`${base}/o/stock-supplies/dashboard`, 'document.body.innerText.includes("Net Profit")');
  await browser.waitFor(`(() => {if(document.querySelector('.copilot-drawer'))return true;document.querySelector('.copilot-button')?.click();return false})()`);
  await delay(1000);
  await browser.evaluate(`(() => {const b=[...document.querySelectorAll('[role=dialog] button')].find(b=>/explain.*profit|why.*profit|profit.*change/i.test(b.textContent));b?.click()})()`);
  await delay(1600);
  const dialog = await browser.evaluate(`(() => {const r=document.querySelector('.copilot-insight-summary').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
  await capture('copilot','/o/stock-supplies/dashboard (Copilot open)',dialog);
  await browser.navigate(`${base}/o/stock-supplies/dashboard`, 'document.body.innerText.includes("Net Profit")');
  // The dedicated Sync Health route is still a foundation screen. Capture only the
  // implemented Dashboard completeness and account-context region, never that placeholder.
  await capture('sync','/o/stock-supplies/dashboard (freshness and coverage)',{x:240,y:55,width:1200,height:240,scale:1});
  await browser.viewport(390,844,true);
  await browser.navigate(`${base}/o/stock-supplies/dashboard`, 'document.body.innerText.includes("Net Profit")');
  const mobileCrop=await browser.evaluate(`(() => {const r=document.querySelector('.primary-kpis').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);
  const mobile=await browser.send('Page.captureScreenshot',{format:'png',clip:mobileCrop,captureBeyondViewport:true});
  await writeFile('artifacts/public-website/source-captures/dashboard-mobile.png',Buffer.from(mobile.data,'base64'));
  const mobileInfo=await sharp(Buffer.from(mobile.data,'base64')).webp({quality:90}).toFile('public/marketing/dashboard-mobile.webp');
  manifest.push({name:'dashboard-mobile',route:'/o/stock-supplies/dashboard',crop:mobileCrop,width:mobileInfo.width,height:mobileInfo.height,bytes:mobileInfo.size,source:'Actual mobile Dashboard KPI region.'});
  await writeFile('artifacts/public-website/source-captures/manifest.json',JSON.stringify(manifest,null,2));
} finally { await browser.close(); }
