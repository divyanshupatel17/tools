import { DoodleField } from './doodle_field';
import { HeroSearchTrigger } from '@/components/search/hero_search_trigger';
import { Art } from '@/components/ui/art';
import { Doodle } from '@/components/ui/doodle';

interface Mascot {
  src: string;
  width: number;
  height: number;
  className: string;
}

// Never mirror these: each character is drawn head-up and centred, so flipping one swaps which slice survives the clip and looks pasted in.
const MASCOTS: Mascot[] = [
  {
    src: '/images/mascot-girl.webp',
    width: 505,
    height: 900,
    className: 'top-[1%] left-[-4%] w-[clamp(100px,16vw,258px)] rotate-[-4deg]',
  },
  {
    src: '/images/mascot-sunglasses.webp',
    width: 362,
    height: 820,
    className: 'top-[44%] left-[-5%] hidden w-[clamp(100px,15vw,242px)] rotate-[5deg] lg:block',
  },
  {
    src: '/images/mascot-glasses.webp',
    width: 470,
    height: 860,
    className: 'top-[0%] right-[-4%] w-[clamp(104px,16.5vw,266px)] rotate-[4deg]',
  },
  {
    src: '/images/mascot-round-glasses.webp',
    width: 390,
    height: 820,
    className: 'top-[46%] right-[-5%] hidden w-[clamp(100px,14.5vw,234px)] rotate-[-5deg] lg:block',
  },
];

export function Hero() {
  return (
    // z-30 keeps search results above the sections that follow.
    <section className="bg-paper relative z-30 pt-6 pb-10 sm:pt-10 sm:pb-14">
      {/* Masked at the foot so characters dissolve instead of being sliced flat at the section boundary. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent_99%)]"
      >
        <DoodleField />

        {MASCOTS.map((mascot) => (
          <Art
            key={mascot.src}
            src={mascot.src}
            width={mascot.width}
            height={mascot.height}
            priority
            className={`absolute h-auto ${mascot.className}`}
          />
        ))}
      </div>

      <div className="relative mx-auto flex max-w-[720px] flex-col items-center px-4 text-center sm:px-6">
        <h1 className="font-hand text-[clamp(2.6rem,7.6vw,6.75rem)] leading-[0.98]">
          <span className="text-ink block">All Tools.</span>
          <span className="text-brand-strong relative inline-block">
            One Place.
            <span
              aria-hidden
              className="brush-underline absolute inset-x-1 -bottom-[0.08em] h-[0.06em] min-h-[4px]"
            />
          </span>
        </h1>

        <p className="text-muted mt-6 max-w-[27ch] text-[clamp(0.95rem,1.6vw,1.2rem)] leading-relaxed sm:mt-7 sm:max-w-[38ch]">
          Fast, secure and easy-to-use online tools for PDFs, Images, Developers and more.
        </p>

        <div className="mt-6 w-full sm:mt-7">
          <HeroSearchTrigger />
        </div>

        <p className="font-hand text-muted mt-4 flex items-center gap-2 text-[17px]">
          <Doodle name="arrow-curve" className="h-auto w-6 -scale-x-100" />
          Start typing to find the perfect tool!
        </p>
      </div>
    </section>
  );
}
