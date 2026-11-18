import type { NextConfig } from 'next';

const backendOrigin = (
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:3001'
).replace(/\/$/, '');

const nextConfig: NextConfig = {
  transpilePackages: ['@ebieshop/shared'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendOrigin}/api/v1/:path*`,
      },
      {
        source: '/healthz',
        destination: `${backendOrigin}/healthz`,
      },
    ];
  },
};

export default nextConfig;
