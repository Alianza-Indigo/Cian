import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Los errores de tipo deben romper el build. Nunca poner esto en true.
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        // El service worker debe poder controlar todo el origen y no debe
        // quedar cacheado por el navegador entre despliegues.
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
