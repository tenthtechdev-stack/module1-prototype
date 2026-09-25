import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return ['account', 'auth', 'onboarding', 'o', 'platform'].map((segment) => ({ source: `/${segment}/:path*`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }));
  },
};

export default nextConfig;
