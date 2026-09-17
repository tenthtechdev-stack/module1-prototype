import { notFound } from 'next/navigation';
import { marketingPages } from '@/src/content/marketing/pages';
import { pageMetadata } from '@/src/content/marketing/seo';
import { SEOPage } from '@/src/components/marketing/seo-page';

export const dynamicParams = false;
export function generateStaticParams() { return marketingPages.map((page) => ({ slug: page.slug.split('/') })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = marketingPages.find((entry) => entry.slug === slug.join('/'));
  if (!page) notFound();
  return pageMetadata(`/${page.slug}`, page.title, page.description);
}
export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = marketingPages.find((entry) => entry.slug === slug.join('/'));
  if (!page) notFound();
  return <SEOPage page={page} />;
}
