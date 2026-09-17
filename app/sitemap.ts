import type { MetadataRoute } from 'next';
import { publicPaths } from '@/src/content/marketing/pages';
import { siteOrigin } from '@/src/content/marketing/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({ url: new URL(path, siteOrigin).href, changeFrequency: 'monthly', priority: path === '/' ? 1 : path.startsWith('/integrations/') ? 0.7 : 0.8 }));
}
