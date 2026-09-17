import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#111f32"/><path d="M0 570H1200" stroke="#344663"/><text x="102" y="89" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-weight="600" font-size="29">Stock Supplies.</text><text x="55" y="173" fill="#93b6ed" font-family="Segoe UI,Arial,sans-serif" font-size="13" letter-spacing="2">MODULE 01 / MARKETPLACE PROFITABILITY</text><g fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="47" font-weight="600"><text x="55" y="257">Marketplace</text><text x="55" y="315">profitability you</text><text x="55" y="373">can actually</text><text x="55" y="431" fill="#8db6ff">explain.</text></g><text x="55" y="505" fill="#b7c7df" font-family="Segoe UI,Arial,sans-serif" font-size="18">Amazon + eBay + Temu</text><text x="55" y="606" fill="#9fb0c8" font-family="Segoe UI,Arial,sans-serif" font-size="13">See what you sold. See what it cost. See what you actually made.</text><rect x="590" y="141" width="660" height="376" rx="7" fill="#dce6f5"/></svg>`;
const screenshot = await sharp('public/marketing/dashboard.webp').resize(690).png().toBuffer();
const screenshotCrop = await sharp(screenshot).extract({left:0,top:0,width:604,height:363}).png().toBuffer();
const logo = await sharp(await readFile('public/favicon.svg')).resize(35,35).png().toBuffer();
await sharp(Buffer.from(svg)).composite([{input:screenshotCrop,left:596,top:147},{input:logo,left:55,top:62}]).png({compressionLevel:9}).toFile('public/marketing/og.png');
console.log('Created 1200 × 630 branded OG image with an actual product crop.');
