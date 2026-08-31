import type { Metadata } from 'next';
import { Container } from '@/components/layout/container';
import { buildMetadata } from '@/lib/seo/metadata';
import { SITE_NAME } from '@/lib/seo/site';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy',
  description: `How ${SITE_NAME} handles your files. Everything runs in your browser; nothing is uploaded.`,
  path: '/privacy',
});

const LAST_UPDATED = 'August 31, 2026';

export default function PrivacyPage() {
  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-hand text-ink text-4xl">Privacy</h1>
        <p className="text-soft-text mt-2 text-sm">Last updated {LAST_UPDATED}</p>
      </div>

      <div className="text-soft-text mx-auto mt-8 max-w-2xl space-y-8 text-sm leading-relaxed sm:text-base">
        <section>
          <h2 className="text-ink text-lg font-semibold">Local processing</h2>
          <p className="mt-2">
            Files are processed in your browser using the File API, Canvas, Web Workers and
            WebAssembly. A file you select stays in that browser tab&apos;s memory and is
            discarded when the tab closes. Nothing is uploaded, stored, or logged.
          </p>
          <p className="mt-2">
            This is an architectural property, not a policy: there is no backend, no database,
            and no file storage to upload to.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">No unnecessary uploads</h2>
          <p className="mt-2">
            A tool never sends a file, its contents, or its name anywhere. That includes
            analytics, error reporting and third party scripts. If a feature would require it,
            it does not ship.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">Site analytics</h2>
          <p className="mt-2">
            The site uses Firebase Analytics to see which pages and tools get visited, and
            whether a tool run succeeded, failed or produced a download. Each of those events
            carries only a tool&apos;s name and category, plus the standard device and
            approximate location data any site using it collects. It never sees a file, a file
            name, or anything typed into a tool.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">If server processing is ever needed</h2>
          <p className="mt-2">
            A small number of tools may eventually need a server for a format that is
            impractical in the browser. If that happens, it is an explicit per tool decision,
            never a silent fallback, and the tool page states plainly what is sent, why, and how
            long it is kept. The default stays local; server processing is opt in and the rest
            of the site stays browser only.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">Contact</h2>
          <p className="mt-2">Questions about this policy can be sent through the contact details on the homepage.</p>
        </section>
      </div>
    </Container>
  );
}
