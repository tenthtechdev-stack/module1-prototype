import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

// Crops preserve the original UI pixels; no features or financial values are retouched.
const sources = [
  { name: 'dashboard', source: 'artifacts/dashboard-screenshots/healthy-dashboard.png', route: '/o/stock-supplies/dashboard', crop: [237,55,1015,580] },
  { name: 'amazon', source: 'artifacts/dashboard-screenshots/amazon-only.png', route: '/o/stock-supplies/dashboard', crop: [237,55,1015,580] },
  { name: 'product', source: 'artifacts/product-screenshots/13-product-detail-overview.png', route: '/o/stock-supplies/products/prd-gloves-xl', crop: [240,104,1175,670] },
  { name: 'cogs', source: 'artifacts/phase-5/browser/10-column-mapping.png', route: '/o/stock-supplies/cogs/import/[importId]', crop: [215,195,773,682] },
  { name: 'groups', source: 'artifacts/phase-5-product-groups/browser/group-detail.png', route: '/o/stock-supplies/cogs/groups/grp-disposable-gloves', crop: [268,204,1145,564] },
  { name: 'copilot', source: 'artifacts/dashboard-screenshots/copilot-explanation.png', route: '/o/stock-supplies/dashboard', crop: [700,55,550,580] },
  { name: 'sync', source: 'artifacts/dashboard-screenshots/ebay-auth-failed-health.png', route: '/o/stock-supplies/operations/sync-health', crop: [237,104,1015,530] },
];
await mkdir('public/marketing', { recursive: true });
for (const item of sources) {
  const meta = await sharp(item.source).metadata();
  let [left, top, width, height] = item.crop;
  width = Math.min(width, meta.width - left); height = Math.min(height, meta.height - top);
  const output = `public/marketing/${item.name}.webp`;
  const info = await sharp(item.source).extract({ left, top, width, height }).resize(1200,760,{ fit:'contain', background:'#f6f7f9' }).webp({ quality:88 }).toFile(output);
  item.output = output; item.width = info.width; item.height = info.height; item.bytes = info.size;
}
await mkdir('artifacts/public-website', { recursive: true });
await writeFile('artifacts/public-website/curated-asset-manifest.json', JSON.stringify(sources,null,2));
console.log(JSON.stringify(sources.map(({name,bytes}) => ({name,bytes}))));
