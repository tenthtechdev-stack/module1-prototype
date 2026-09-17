import Image from 'next/image';
import dashboard from '@/public/marketing/dashboard.webp';
import dashboardMobile from '@/public/marketing/dashboard-mobile.webp';
import amazon from '@/public/marketing/amazon.webp';
import product from '@/public/marketing/product.webp';
import cogs from '@/public/marketing/cogs.webp';
import groups from '@/public/marketing/groups.webp';
import copilot from '@/public/marketing/copilot.webp';
import sync from '@/public/marketing/sync.webp';

const assets = { dashboard, amazon, product, cogs, groups, copilot, sync };

const screens = {
  dashboard: { alt: 'Stock Supplies Dashboard with combined Amazon, eBay and Temu revenue, net profit, margin and cost coverage.', label: 'Marketplace Profitability', width: 1200, height: 760 },
  amazon: { alt: 'Amazon-filtered profitability dashboard showing channel context and cost components.', label: 'Amazon · Marketplace Profitability', width: 1200, height: 760 },
  product: { alt: 'Product Detail showing a Product identity, marketplace Listings, profitability and product cost.', label: 'Product Profitability', width: 1200, height: 760 },
  cogs: { alt: 'COGS import column mapping and cost review in the Stock Supplies workspace.', label: 'COGS Management', width: 1200, height: 760 },
  groups: { alt: 'Disposable Gloves Product Group with bulk cost, base quantity and inherited COGS.', label: 'Product Groups · Disposable Gloves', width: 1200, height: 760 },
  copilot: { alt: 'Contextual Copilot explaining product data alongside the current profitability workspace.', label: 'Contextual Copilot', width: 1200, height: 760 },
  sync: { alt: 'Dashboard account context, source freshness and profitability coverage indicators.', label: 'Data freshness & coverage', width: 1200, height: 760 },
};
export type ScreenshotKey = keyof typeof screens;
export function ProductScreenshot({ name, priority = false, compact = false }: { name: ScreenshotKey; priority?: boolean; compact?: boolean }) {
  const screen = screens[name];
  return <figure className={`m-screenshot m-screen-${name} ${compact ? 'm-screenshot-compact' : ''}`}>
    {priority && <>{name === 'dashboard' && <link rel="preload" as="image" href={dashboardMobile.src} media="(max-width: 760px)" />}<link rel="preload" as="image" href={assets[name].src} media={name === 'dashboard' ? '(min-width: 761px)' : undefined} /></>}
    <div className="m-browser-bar"><span aria-hidden="true"><i /><i /><i /></span><span>Stock Supplies / {screen.label}</span><span className="m-example-label">Example data</span></div>
    <div className="m-screen-viewport" role="region" aria-label={`${screen.label} screenshot; scroll horizontally on small screens`} tabIndex={0}>
      <picture>{name === 'dashboard' && <source media="(max-width: 760px)" srcSet={dashboardMobile.src} width={dashboardMobile.width} height={dashboardMobile.height} />}<Image src={assets[name]} unoptimized alt={screen.alt} width={screen.width} height={screen.height} sizes={compact ? '(max-width: 760px) 740px, (max-width: 1100px) 90vw, 650px' : '(max-width: 760px) 100vw, (max-width: 1300px) 92vw, 1200px'} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} /></picture>
    </div><figcaption>Actual product interface. Illustrative product data.</figcaption>
  </figure>;
}
