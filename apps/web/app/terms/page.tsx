import type { Metadata } from 'next';
import { Container } from '@/components/layout/container';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({
  title: 'Terms',
  description: 'Terms of use for divyanshupatel.com/tools.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <Container className="py-16 sm:py-20">
      <h1 className="font-hand text-ink text-4xl">Terms</h1>

      <div className="text-soft-text mt-8 max-w-2xl space-y-8 text-sm leading-relaxed sm:text-base">
        <section>
          <h2 className="text-ink text-lg font-semibold">What this is</h2>
          <p className="mt-2">
            Free browser based tools. No account, no payment, no warranty. Use at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">Your files</h2>
          <p className="mt-2">
            Processing happens locally in your browser, see the{' '}
            <a href="/privacy" className="text-ink underline underline-offset-2">
              privacy page
            </a>
            . You are responsible for the files you choose to process and for keeping your own
            copies; nothing is stored here to recover from.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">Acceptable use</h2>
          <p className="mt-2">
            Do not use the tools to process content you do not have the right to process, or to
            attempt to break, scrape, or overload the site.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">No warranty</h2>
          <p className="mt-2">
            The site is provided as is, without warranty of any kind. Output correctness
            (conversion fidelity, compression results, and so on) is not guaranteed for every
            input.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">Changes</h2>
          <p className="mt-2">
            These terms may change as the site changes. Continued use means you accept the
            current version.
          </p>
        </section>

        <section>
          <h2 className="text-ink text-lg font-semibold">Contact</h2>
          <p className="mt-2">See the contact details on the homepage.</p>
        </section>
      </div>
    </Container>
  );
}
