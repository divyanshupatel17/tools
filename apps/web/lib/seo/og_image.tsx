import { ImageResponse } from 'next/og';
import { SITE_DESCRIPTION, SITE_NAME } from './site';

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/** Shared default share-card, reused by the root opengraph-image and twitter-image routes. */
export function renderSiteOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: '80px',
          background: '#ffc928',
          color: '#1b1a17',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 96,
            height: 96,
            borderRadius: 24,
            background: '#1b1a17',
            color: '#ffc928',
            fontSize: 48,
            fontWeight: 800,
          }}
        >
          T
        </div>
        <div style={{ display: 'flex', marginTop: 48, fontSize: 68, fontWeight: 800 }}>
          {SITE_NAME}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontSize: 32,
            maxWidth: 900,
            color: '#3a3324',
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE },
  );
}
