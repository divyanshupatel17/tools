import { Heart, Lightbulb, Mail, ScrollText, Star } from 'lucide-react';
import { DinoGame } from './dino_game';
import { RunnerScores } from './runner_scores';
import { Art } from '@/components/ui/art';
import { Doodle } from '@/components/ui/doodle';
import { SOCIAL_ICONS } from '@/components/ui/social_icons';
import { CONTACT_EMAIL, OWNER_NAME, OWNER_ROLE, SOCIAL_LINKS } from '@/lib/landing/contact';
import { WEEKLY_TOP_5 } from '@/lib/landing/leaderboard';
import { absoluteUrl } from '@/lib/seo/site';

const DOC_LINKS = [
  { label: 'Terms of Service', href: absoluteUrl('/terms') },
  { label: 'Privacy Policy', href: absoluteUrl('/privacy') },
];

const SUGGEST_SUBJECT = encodeURIComponent('Tool suggestion for divyanshupatel.com/tools');

/** One painted desert. Every block below floats over it — no boxes, no dividers. */
export function LandingFooter() {
  return (
    <footer className="paper-grain relative isolate overflow-hidden">
      <div aria-hidden className="footer-wash absolute inset-0 -z-20" />
      {/* Masked at the top so the desert dissolves into the wash instead of butting against it. */}
      <Art
        src="/images/footer-landscape.webp"
        width={1600}
        height={850}
        className="absolute bottom-0 left-1/2 -z-10 w-full min-w-[900px] -translate-x-1/2 [mask-image:linear-gradient(to_bottom,transparent_0%,black_30%)] dark:brightness-[0.17] dark:saturate-[0.5]"
      />

      <div className="relative mx-auto max-w-[1240px] px-4 pt-16 sm:px-6 sm:pt-20">
        <div className="grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          <section id="contact" className="scroll-mt-24">
            <h2 className="font-hand text-ink text-2xl">Contact</h2>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-ink/80 hover:text-ink mt-3 flex items-center gap-2 text-sm"
            >
              <Mail aria-hidden className="size-4 shrink-0" />
              {CONTACT_EMAIL}
            </a>
            <p className="font-hand text-ink/70 mt-2 flex items-center gap-2 text-[17px]">
              I’d love to hear from you!
              <Doodle name="arrow-curve" className="h-auto w-7" />
            </p>

            <p className="text-ink/80 mt-5 flex items-center gap-1.5 text-sm">
              Made with
              <Heart aria-hidden className="fill-danger text-danger size-4" />
              by {OWNER_NAME}
            </p>
            <p className="text-ink/60 text-sm">{OWNER_ROLE}</p>

            <div className="mt-5">
              <p className="text-ink flex items-center gap-1.5 text-sm font-bold">
                <Art src="/images/coffee-cup.webp" width={90} height={128} className="h-6 w-auto" />
                Buy me a coffee
                <Heart aria-hidden className="text-danger size-3.5" />
              </p>
              <p className="text-ink/65 mt-1 max-w-[26ch] text-[12.5px] leading-snug">
                Your support helps me keep building free tools!
              </p>
            </div>

            <ul className="mt-4 flex items-center gap-3">
              {SOCIAL_LINKS.map(({ label, href }) => {
                const Icon = SOCIAL_ICONS[label];
                return (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={label}
                      className="text-ink/70 hover:text-ink flex size-8 items-center justify-center rounded-full transition-colors"
                    >
                      {Icon ? <Icon className="size-[18px]" /> : label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className="font-hand text-ink flex items-center gap-2 text-2xl">
              <ScrollText aria-hidden className="size-5" />
              Legal
            </h2>
            <ul className="mt-3 space-y-1.5">
              {DOC_LINKS.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-ink/75 hover:text-ink text-sm">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="relative">
            <h2 className="font-hand text-ink flex items-center gap-2 text-2xl">
              <Lightbulb aria-hidden className="size-5" />
              Suggest a Tool
            </h2>
            <p className="text-ink/75 mt-3 text-sm">Missing a tool you need?</p>
            <p className="font-hand text-ink/70 text-[17px]">Let me know!</p>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${SUGGEST_SUBJECT}`}
              className="bg-brand text-ink hover:bg-brand-strong mt-3 inline-flex h-10 items-center rounded-full px-5 text-sm font-bold transition-colors"
            >
              Suggest Tool
            </a>
            <Doodle
              name="arrow-curve"
              className="absolute top-[62%] right-4 hidden h-auto w-12 lg:block"
            />
          </section>

          <section>
            <h2 className="font-hand text-ink flex items-center gap-2 text-2xl">
              <Star aria-hidden className="fill-brand text-brand-strong size-5" />
              Weekly Top 5 Scores
            </h2>
            <ol className="mt-3 space-y-1">
              {WEEKLY_TOP_5.map((row, index) => (
                <li key={row.name} className="flex items-baseline gap-2 text-sm">
                  <span className="text-ink/50 w-4 shrink-0 tabular-nums">{index + 1}.</span>
                  <span className="text-ink/80 truncate">{row.name}</span>
                  <span className="text-ink/70 ml-auto font-mono text-[13px] tabular-nums">
                    {row.score}
                  </span>
                </li>
              ))}
            </ol>
            <RunnerScores />
          </section>
        </div>

        <Doodle name="cloud" className="mt-10 ml-[22%] hidden h-auto w-20 opacity-60 sm:block" />
      </div>

      {/* Full-bleed so the running line reaches both edges of the desert. */}
      <div className="relative mt-8 sm:mt-10">
        <DinoGame />
      </div>
    </footer>
  );
}
