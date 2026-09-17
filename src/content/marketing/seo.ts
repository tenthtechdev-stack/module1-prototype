import type { Metadata } from 'next';
import type { FAQItem } from '@/src/components/marketing/sections';

const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const parsedOrigin = new URL(configuredOrigin);
if (!['http:', 'https:'].includes(parsedOrigin.protocol)) throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTP(S) URL');
export const siteOrigin = parsedOrigin.origin;
export const homeSEO = { title: 'Marketplace Profitability & Analytics | Stock Supplies', description: 'Understand marketplace profit across Amazon, eBay and Temu with Product costs, fees, refunds, historical COGS and explainable Net Profit.' };
export function pageMetadata(path: string, title: string, description: string): Metadata {
  const url = new URL(path, siteOrigin).href;
  const image = { url: `${siteOrigin}/marketing/og.png`, width: 1200, height: 630, alt: 'Stock Supplies: Marketplace profitability you can actually explain.' };
  return { title: { absolute: title }, description, alternates: { canonical: url }, robots: { index: true, follow: true }, openGraph: { title, description, url, siteName: 'Stock Supplies', type: 'website', locale: 'en_GB', images: [image] }, twitter: { card: 'summary_large_image', title, description, images: [image.url] } };
}
export function structuredData(path: string, title: string, faq: FAQItem[], software = false) {
  const url = new URL(path, siteOrigin).href;
  const nodes: Record<string, unknown>[] = [];
  if (path === '/') nodes.push({ '@type': 'Organization', '@id': `${siteOrigin}/#organisation`, name: 'Stock Supplies', url: siteOrigin, logo: `${siteOrigin}/favicon.svg` });
  else nodes.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${siteOrigin}/` }, ...(path.startsWith('/integrations/') ? [{ '@type': 'ListItem', position: 2, name: 'Marketplaces', item: `${siteOrigin}/marketplace-analytics` }] : []), { '@type': 'ListItem', position: path.startsWith('/integrations/') ? 3 : 2, name: title, item: url }] });
  if (software) nodes.push({ '@type': 'WebApplication', name: 'Stock Supplies — Module 01', url, applicationCategory: 'BusinessApplication', operatingSystem: 'Web browser', description: title });
  if (faq.length) nodes.push({ '@type': 'FAQPage', mainEntity: faq.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) });
  return { '@context': 'https://schema.org', '@graph': nodes };
}
