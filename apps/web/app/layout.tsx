import type { Metadata, Viewport } from 'next';
import { Caveat_Brush, JetBrains_Mono, Nunito_Sans } from 'next/font/google';
import { Suspense } from 'react';
import '@/styles/globals.css';
import { FirebaseAnalytics } from '@/components/analytics/firebase_analytics';
import { LandingFooter } from '@/components/landing/landing_footer';
import { SiteHeader } from '@/components/layout/site_header';
import { ThemeScript } from '@/components/theme/theme_script';
import { rootMetadata } from '@/lib/seo/metadata';
import { webSiteJsonLd } from '@/lib/seo/structured_data';

const display = Caveat_Brush({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-caveat-brush',
});

const sans = Nunito_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nunito-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = rootMetadata;

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fff9e8' },
    { media: '(prefers-color-scheme: dark)', color: '#1e1a13' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <ThemeScript />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd()) }}
        />
      </head>
      <body className="bg-background">
        <a
          href="#main"
          className="skip-link bg-brand text-ink rounded-full px-4 py-2 font-semibold"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <LandingFooter />
        <Suspense fallback={null}>
          <FirebaseAnalytics />
        </Suspense>
      </body>
    </html>
  );
}
