import Link from 'next/link';
import { Brand } from './header';

const columns = [
  { title: 'Product', links: [['Marketplace Profitability', '/marketplace-profitability'], ['Product Profitability', '/product-profitability'], ['COGS Management', '/cogs-management'], ['Product Groups', '/product-groups'], ['Copilot', '/copilot']] },
  { title: 'Marketplaces', links: [['Combined analytics', '/marketplace-analytics'], ['Amazon', '/integrations/amazon'], ['eBay', '/integrations/ebay'], ['Temu', '/integrations/temu']] },
  { title: 'Company', links: [['About', '/about'], ['Security & access', '/security'], ['Contact', '/contact'], ['Pricing & access', '/pricing']] },
  { title: 'Account', links: [['Sign in', '/auth/sign-in'], ['Start Test Plan', '/auth/register']] },
];
export function MarketingFooter() {
  return <footer className="m-footer"><div className="m-container"><div className="m-footer-grid"><div><Brand /><p>See what you sold.<br />See what it cost.<br />See what you actually made.</p><span className="m-eyebrow">Commerce, accounted for.</span></div>{columns.map((column) => <nav key={column.title} aria-label={`Footer ${column.title}`}><h2>{column.title}</h2>{column.links.map(([label, href]) => <Link prefetch={false} href={href} key={href}>{label}</Link>)}</nav>)}</div><div className="m-footer-bottom"><span>© {new Date().getFullYear()} Stock Supplies</span><span>Module 01 · Marketplace Profitability & Analytics</span><span>Amazon, eBay and Temu are marketplace names, not endorsements.</span></div></div></footer>;
}
