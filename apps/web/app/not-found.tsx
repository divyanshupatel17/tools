import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Art } from '@/components/ui/art';

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center gap-5 py-20 text-center">
      <Art src="/images/mascot-sunglasses.webp" width={362} height={820} className="h-32 w-auto" />
      <h1 className="font-hand text-4xl">That tool is not here</h1>
      <p className="text-muted max-w-md">
        The page you asked for does not exist. Try browsing everything instead.
      </p>
      <Link
        href="/all"
        className="bg-brand text-ink hover:bg-brand-strong inline-flex h-11 items-center rounded-full px-5 font-bold transition-colors"
      >
        Browse all tools
      </Link>
    </Container>
  );
}
