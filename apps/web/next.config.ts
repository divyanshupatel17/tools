import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

// html-minifier-terser statically imports clean-css purely for its optional minifyCSS
// path, which this app never enables — but clean-css itself requires Node's `fs` and
// cannot be bundled for the browser as is. See lib/stubs/clean_css_stub.ts.
const cleanCssStub = fileURLToPath(new URL('./lib/stubs/clean_css_stub.ts', import.meta.url));

// The app is served at divyanshupatel.com/tools, so every route is authored
// without the /tools prefix and Next adds it to URLs and assets.
const config: NextConfig = {
  basePath: '/tools',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@tools/ui', '@tools/file_utils', '@tools/tool_engine'],
  turbopack: {
    resolveAlias: {
      'clean-css': { browser: cleanCssStub },
    },
  },
  // `next dev` still runs on Turbopack (turbopack.resolveAlias above); the production
  // build runs on webpack (`next build --webpack`, see package.json) because Turbopack's
  // production build hangs indefinitely on Vercel for this app's WASM-heavy dependency
  // graph until the platform's 45 minute build ceiling kills it (BUILD_EXCEEDED_MAXIMUM_TIME).
  // Turbopack ignores `webpack()` and webpack ignores `turbopack`, so both aliases are kept.
  webpack: (webpackConfig) => {
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      'clean-css': cleanCssStub,
    };
    return webpackConfig;
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
