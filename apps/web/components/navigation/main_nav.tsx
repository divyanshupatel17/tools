'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { label: 'Popular Tools', href: '/#popular' },
  { label: 'All Tools', href: '/all' },
  { label: 'Categories', href: '/#categories' },
  { label: 'Contact', href: '/#contact' },
] as const;

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex items-center gap-1 sm:gap-1.5">
        {NAV.map((item) => {
          const active = item.href === '/all' && pathname === '/all';

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex h-9 items-center rounded-full px-2.5 text-[14.5px] whitespace-nowrap transition-colors sm:px-3 sm:text-[15px]',
                  active
                    ? 'text-foreground after:bg-brand-strong font-semibold after:absolute after:inset-x-3 after:bottom-1 after:h-[2px] after:rounded-full'
                    : 'text-muted hover:text-foreground font-medium',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
