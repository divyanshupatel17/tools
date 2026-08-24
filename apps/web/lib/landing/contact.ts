export const OWNER_NAME = 'Divyanshu Patel';
export const OWNER_ROLE = 'Full Stack Developer & Indie Maker';
export const OWNER_SITE_URL = 'https://divyanshupatel.com';
export const CONTACT_EMAIL = 'divyanshupatel.dev@gmail.com';

/** The project's own repo, distinct from the owner's personal GitHub profile in SOCIAL_LINKS. */
export const REPO_URL = 'https://github.com/divyanshupatel17/tools';

export const SOCIAL_LINKS = [
  { label: 'GitHub', href: 'https://github.com/divyanshupatel17' },
  { label: 'X', href: 'https://x.com/Divyanshu170404' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/patel-divyanshu' },
  { label: 'Instagram', href: 'https://instagram.com/patel_divyanshu_' },
] as const;

export type SocialLabel = (typeof SOCIAL_LINKS)[number]['label'];
