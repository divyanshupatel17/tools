export interface ParsedUrl {
  href: string;
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  searchParams: [string, string][];
  hash: string;
  origin: string;
}

export interface ParseUrlSuccess {
  ok: true;
  url: ParsedUrl;
}
export interface ParseUrlFailure {
  ok: false;
  message: string;
}
export type ParseUrlResult = ParseUrlSuccess | ParseUrlFailure;

export function parseUrl(input: string): ParseUrlResult {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Enter a URL to parse.' };
  }
  try {
    const url = new URL(trimmed);
    return {
      ok: true,
      url: {
        href: url.href,
        protocol: url.protocol.replace(/:$/, ''),
        username: url.username,
        password: url.password,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        searchParams: Array.from(url.searchParams.entries()),
        hash: url.hash,
        origin: url.origin,
      },
    };
  } catch {
    return { ok: false, message: 'That is not a valid URL. Include the protocol, for example https://' };
  }
}

export const SAMPLE_URLS: string[] = [
  'https://example.com/path?name=value#section',
  'https://user:pass@sub.example.co.uk:8443/products/42?ref=ad&utm_source=newsletter#reviews',
  'ftp://files.example.org:21/archive/data.zip',
  'https://divyanshupatel.com/tools?category=developer&sort=popular',
];
