import type { NextConfig } from 'next';

// The app is served at divyanshupatel.com/tools, so every route is authored
// without the /tools prefix and Next adds it to URLs and assets.
const config: NextConfig = {
  basePath: '/tools',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@tools/ui', '@tools/file_utils', '@tools/tool_engine'],
  turbopack: {
    resolveAlias: {
      // html-minifier-terser statically imports clean-css purely for its optional minifyCSS
      // path, which this app never enables — but clean-css itself requires Node's `fs` and
      // cannot be bundled for the browser as is. See lib/stubs/clean_css_stub.ts.
      'clean-css': { browser: './lib/stubs/clean_css_stub.ts' },
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default config;
