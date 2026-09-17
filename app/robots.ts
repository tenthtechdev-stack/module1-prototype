import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/src/content/marketing/seo';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/auth', '/onboarding', '/o/', '/platform', '/api/', '/dev/'] }, sitemap: `${siteOrigin}/sitemap.xml` };
}
