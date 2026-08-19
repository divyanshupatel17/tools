import type { Metadata } from 'next';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from './site';

interface PageMetadataInput {
  title: string;
  description: string;
  path: string;
  keywords?: readonly string[];
}

export function buildMetadata({ title, description, path, keywords }: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    ...(keywords?.length ? { keywords: [...keywords] } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: SITE_NAME,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Free Online Tools',
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'Free Online Tools',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Online Tools',
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};
