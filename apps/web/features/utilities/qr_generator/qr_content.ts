/**
 * QR type metadata and content builders. Each type owns a small field record and a pure
 * function that turns those fields into the exact string encoded into the QR symbol. Kept
 * free of React so the encoding logic is independently testable.
 */

export type QrTypeId =
  | 'url'
  | 'text'
  | 'email'
  | 'phone'
  | 'sms'
  | 'vcard'
  | 'mecard'
  | 'location'
  | 'wifi'
  | 'event'
  | 'whatsapp'
  | 'telegram'
  | 'facetime'
  | 'skype'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'linkedin'
  | 'spotify'
  | 'paypal'
  | 'pinterest'
  | 'crypto'
  | 'website'
  | 'googlemaps'
  | 'appstore'
  | 'playstore'
  | 'universal';

export interface QrTypeMeta {
  id: QrTypeId;
  label: string;
  hint: string;
}

export const QR_TYPES: readonly QrTypeMeta[] = [
  { id: 'url', label: 'URL', hint: 'A link to any page.' },
  { id: 'text', label: 'Text', hint: 'Plain text, shown as is.' },
  { id: 'email', label: 'Email', hint: 'Opens a new email draft.' },
  { id: 'phone', label: 'Phone', hint: 'Starts a phone call.' },
  { id: 'sms', label: 'SMS', hint: 'Opens a prefilled text message.' },
  { id: 'vcard', label: 'vCard', hint: 'Adds a full contact on scan.' },
  { id: 'mecard', label: 'MeCard', hint: 'A lighter contact card, for older readers.' },
  { id: 'location', label: 'Location', hint: 'Opens a map at these coordinates.' },
  { id: 'wifi', label: 'Wi-Fi', hint: 'Joins a network without typing the password.' },
  { id: 'event', label: 'Calendar', hint: 'Adds an event to a calendar.' },
  { id: 'whatsapp', label: 'WhatsApp', hint: 'Opens a chat with a prefilled message.' },
  { id: 'telegram', label: 'Telegram', hint: 'Opens a Telegram chat.' },
  { id: 'facetime', label: 'FaceTime', hint: 'Starts a FaceTime call.' },
  { id: 'skype', label: 'Skype', hint: 'Starts a Skype call.' },
  { id: 'twitter', label: 'Twitter', hint: 'Links straight to a profile.' },
  { id: 'facebook', label: 'Facebook', hint: 'Links straight to a page or profile.' },
  { id: 'instagram', label: 'Instagram', hint: 'Links straight to a profile.' },
  { id: 'youtube', label: 'YouTube', hint: 'Links to a channel or video.' },
  { id: 'linkedin', label: 'LinkedIn', hint: 'Links straight to a profile.' },
  { id: 'spotify', label: 'Spotify', hint: 'Links to a track, artist or playlist.' },
  { id: 'paypal', label: 'PayPal', hint: 'Opens a PayPal.me payment link.' },
  { id: 'pinterest', label: 'Pinterest', hint: 'Links straight to a profile.' },
  { id: 'crypto', label: 'Bitcoin', hint: 'Prefills a wallet address and amount.' },
  { id: 'website', label: 'Website', hint: 'A link to your site or a landing page.' },
  { id: 'googlemaps', label: 'Google Maps', hint: 'Opens a place or address in Maps.' },
  { id: 'appstore', label: 'App Store', hint: 'Links to an iOS app listing.' },
  { id: 'playstore', label: 'Play Store', hint: 'Links to an Android app listing.' },
  { id: 'universal', label: 'Universal', hint: 'Paste anything. The format is detected for you.' },
];

/** Types whose entire field is a single "paste a link or handle" text input. Covers most of
 *  the brand shortcuts above, which only differ in the domain they resolve a bare handle to. */
export interface SimpleLinkConfig {
  fieldLabel: string;
  placeholder: string;
  hint?: string;
  build: (value: string) => string;
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Pulls the profile path out of a pasted URL on any of a platform's known domains (including
 *  older aliases like `twitter.com` for X), stripping `www.`, a trailing slash, and — unless
 *  `keepQuery` is set — the query string and hash, so a full link cleans down to the same
 *  canonical form a bare handle would produce. `keepQuery` matters for platforms like YouTube
 *  where the identifier itself lives in the query (`/watch?v=...`), not the path. Returns null
 *  when `value` is not a URL on one of those domains. */
function extractProfilePath(value: string, aliasDomains: readonly string[], keepQuery = false): string | null {
  const trimmed = value.trim().replace(/^@/, '');
  const domains = aliasDomains.map((d) => d.replace(/\./g, '\\.')).join('|');
  const match = new RegExp(`^(?:https?:\\/\\/)?(?:www\\.)?(?:${domains})\\/(.+)$`, 'i').exec(trimmed);
  if (!match) return null;
  const path = keepQuery ? match[1]!.split('#')[0]! : match[1]!.split(/[?#]/)[0]!;
  return keepQuery ? path : path.replace(/\/+$/, '');
}

/** A bare handle resolves under `domain`/`handlePrefix`; a URL already on `domain` (or one of
 *  its aliases) is re-canonicalised onto `domain`; any other full URL is passed through
 *  normalized, so a pasted link is never double-prefixed or left un-cleaned. */
function socialUrl(
  domain: string,
  handlePrefix: string,
  value: string,
  aliasDomains: readonly string[] = [domain],
  keepQuery = false,
): string {
  const trimmed = value.trim();
  const extracted = extractProfilePath(trimmed, aliasDomains, keepQuery);
  if (extracted !== null) return `https://${domain}/${extracted}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return normalizeUrl(trimmed);
  const handle = trimmed.replace(/^@/, '').replace(/\/+$/, '');
  return `https://${domain}/${handlePrefix}${handle}`;
}

export const SIMPLE_LINK_TYPES: Partial<Record<QrTypeId, SimpleLinkConfig>> = {
  website: {
    fieldLabel: 'Website URL',
    placeholder: 'https://example.com',
    build: normalizeUrl,
  },
  telegram: {
    fieldLabel: 'Username',
    placeholder: 'yourname',
    build: (v) => socialUrl('t.me', '', v, ['t.me', 'telegram.me']),
  },
  facetime: {
    fieldLabel: 'Phone number or email',
    placeholder: '+1 555 000 0000',
    build: (v) => `facetime:${v.trim().replace(/^facetime:/i, '')}`,
  },
  skype: {
    fieldLabel: 'Skype username',
    placeholder: 'yourname',
    build: (v) => `skype:${v.trim().replace(/^@/, '').replace(/^skype:/i, '').replace(/\?call$/i, '')}?call`,
  },
  twitter: {
    fieldLabel: 'Username or profile URL',
    placeholder: 'yourname',
    build: (v) => socialUrl('x.com', '', v, ['twitter.com', 'x.com']),
  },
  facebook: {
    fieldLabel: 'Username or page URL',
    placeholder: 'yourname',
    build: (v) => socialUrl('facebook.com', '', v, ['facebook.com', 'fb.com', 'm.facebook.com']),
  },
  instagram: {
    fieldLabel: 'Username or profile URL',
    placeholder: 'yourname',
    build: (v) => socialUrl('instagram.com', '', v, ['instagram.com']),
  },
  youtube: {
    fieldLabel: 'Channel or video URL',
    placeholder: 'yourchannel',
    build: (v) => socialUrl('youtube.com', '@', v, ['youtube.com', 'm.youtube.com', 'youtu.be'], true),
  },
  linkedin: {
    fieldLabel: 'Username or profile URL',
    placeholder: 'yourname',
    build: (v) => socialUrl('linkedin.com', 'in/', v, ['linkedin.com']),
  },
  spotify: {
    fieldLabel: 'Profile, track or playlist URL',
    placeholder: 'https://open.spotify.com/…',
    build: (v) => socialUrl('open.spotify.com', 'user/', v, ['open.spotify.com', 'spotify.com']),
  },
  paypal: {
    fieldLabel: 'PayPal.me username or link',
    placeholder: 'yourname',
    build: (v) => socialUrl('paypal.me', '', v, ['paypal.me']),
  },
  pinterest: {
    fieldLabel: 'Username or profile URL',
    placeholder: 'yourname',
    build: (v) => socialUrl('pinterest.com', '', v, ['pinterest.com']),
  },
  appstore: {
    fieldLabel: 'App Store listing URL',
    placeholder: 'https://apps.apple.com/…',
    build: normalizeUrl,
  },
  playstore: {
    fieldLabel: 'Play Store listing URL',
    placeholder: 'https://play.google.com/…',
    build: normalizeUrl,
  },
};

export interface QrFields {
  url: { url: string };
  text: { text: string };
  email: { to: string; subject: string; body: string };
  phone: { number: string };
  sms: { number: string; message: string };
  whatsapp: { number: string; message: string };
  vcard: {
    firstName: string;
    lastName: string;
    organization: string;
    title: string;
    phone: string;
    email: string;
    website: string;
    address: string;
  };
  mecard: { firstName: string; lastName: string; phone: string; email: string; address: string };
  wifi: { ssid: string; password: string; encryption: 'WPA' | 'WEP' | 'nopass'; hidden: boolean };
  location: { latitude: string; longitude: string };
  event: {
    title: string;
    location: string;
    start: string;
    end: string;
    description: string;
  };
  crypto: { address: string; amount: string };
  googlemaps: { query: string; latitude: string; longitude: string };
  website: { value: string };
  telegram: { value: string };
  facetime: { value: string };
  skype: { value: string };
  twitter: { value: string };
  facebook: { value: string };
  instagram: { value: string };
  youtube: { value: string };
  linkedin: { value: string };
  spotify: { value: string };
  paypal: { value: string };
  pinterest: { value: string };
  appstore: { value: string };
  playstore: { value: string };
  universal: { value: string };
}

const SIMPLE_LINK_IDS = Object.keys(SIMPLE_LINK_TYPES) as QrTypeId[];

export function createDefaultFields<T extends QrTypeId>(type: T): QrFields[T] {
  const defaults: QrFields = {
    url: { url: 'https://divyanshupatel.com' },
    text: { text: '' },
    email: { to: '', subject: '', body: '' },
    phone: { number: '' },
    sms: { number: '', message: '' },
    whatsapp: { number: '', message: '' },
    vcard: {
      firstName: '',
      lastName: '',
      organization: '',
      title: '',
      phone: '',
      email: '',
      website: '',
      address: '',
    },
    mecard: { firstName: '', lastName: '', phone: '', email: '', address: '' },
    wifi: { ssid: '', password: '', encryption: 'WPA', hidden: false },
    location: { latitude: '', longitude: '' },
    event: { title: '', location: '', start: '', end: '', description: '' },
    crypto: { address: '', amount: '' },
    googlemaps: { query: '', latitude: '', longitude: '' },
    website: { value: '' },
    telegram: { value: '' },
    facetime: { value: '' },
    skype: { value: '' },
    twitter: { value: '' },
    facebook: { value: '' },
    instagram: { value: '' },
    youtube: { value: '' },
    linkedin: { value: '' },
    spotify: { value: '' },
    paypal: { value: '' },
    pinterest: { value: '' },
    appstore: { value: '' },
    playstore: { value: '' },
    universal: { value: '' },
  };
  return defaults[type];
}

/** Escapes the characters vCard and MeCard TEXT values reserve as field separators. Colon is
 *  deliberately left alone — unlike the WIFI: URI below, vCard/MeCard don't treat it as a
 *  delimiter, and escaping it would corrupt a plain "https://" URL field. */
function escapeVcard(value: string): string {
  return value.replace(/([\\;,])/g, '\\$1');
}

/** Escapes the characters the WIFI: URI reserves as field separators — includes colon, since a
 *  network name or password containing one would otherwise be misread as the next field. */
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:])/g, '\\$1');
}

function escapeIcal(value: string): string {
  return value.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
}

/** `YYYY-MM-DDTHH:mm` (datetime-local's format) to the `YYYYMMDDTHHmmss` iCalendar needs. */
function toIcalDate(value: string): string {
  const digits = value.replace(/[-:]/g, '');
  return digits.includes('T') ? `${digits}00` : digits;
}

export interface QrBuildResult {
  content: string;
  error: string | null;
}

function ok(content: string): QrBuildResult {
  return { content, error: null };
}

function fail(error: string): QrBuildResult {
  return { content: '', error };
}

const GEO_PAIR_RE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Pulls a latitude/longitude pair out of a pasted Google Maps URL — the `@lat,lng,zoom` in a
 *  place link, the `!3d..!4d..` pin marker in an embed link, or a `q=`/`ll=` query parameter —
 *  so pasting a full share link works exactly like typing coordinates directly. Shortened links
 *  (goo.gl, maps.app.goo.gl) cannot be resolved client side, so they fall through unencoded. */
function extractGeoFromMapsUrl(value: string): { lat: string; lng: string } | null {
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(value);
  if (at) return { lat: at[1]!, lng: at[2]! };
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(value);
  if (pin) return { lat: pin[1]!, lng: pin[2]! };
  try {
    const url = new URL(value);
    const param = url.searchParams.get('q') ?? url.searchParams.get('ll') ?? url.searchParams.get('query');
    const pair = param ? GEO_PAIR_RE.exec(param) : null;
    if (pair) return { lat: pair[1]!, lng: pair[2]! };
  } catch {
    // Not an absolute URL — nothing to parse.
  }
  return null;
}

/** Turns a type's field record into the literal string that gets encoded into the QR symbol. */
export function buildQrContent<T extends QrTypeId>(type: T, fields: QrFields[T]): QrBuildResult {
  if (SIMPLE_LINK_IDS.includes(type)) {
    const { value } = fields as QrFields['website'];
    if (!value.trim()) return fail('Enter a value.');
    return ok(SIMPLE_LINK_TYPES[type]!.build(value));
  }

  switch (type) {
    case 'url': {
      const { url } = fields as QrFields['url'];
      if (!url.trim()) return fail('Enter a URL.');
      return ok(normalizeUrl(url));
    }
    case 'text': {
      const { text } = fields as QrFields['text'];
      if (!text.trim()) return fail('Enter some text.');
      return ok(text);
    }
    case 'email': {
      const { to, subject, body } = fields as QrFields['email'];
      if (!to.trim()) return fail('Enter a recipient email address.');
      const params = new URLSearchParams();
      if (subject) params.set('subject', subject);
      if (body) params.set('body', body);
      const query = params.toString();
      return ok(`mailto:${to.trim()}${query ? `?${query}` : ''}`);
    }
    case 'phone': {
      const { number } = fields as QrFields['phone'];
      if (!number.trim()) return fail('Enter a phone number.');
      return ok(`tel:${number.trim().replace(/[^\d+]/g, '')}`);
    }
    case 'sms': {
      const { number, message } = fields as QrFields['sms'];
      if (!number.trim()) return fail('Enter a phone number.');
      const digits = number.trim().replace(/[^\d+]/g, '');
      return ok(message ? `sms:${digits}?body=${encodeURIComponent(message)}` : `sms:${digits}`);
    }
    case 'whatsapp': {
      const { number, message } = fields as QrFields['whatsapp'];
      if (!number.trim()) return fail('Enter a phone number with the country code.');
      const digits = number.trim().replace(/[^\d]/g, '');
      const query = message ? `?text=${encodeURIComponent(message)}` : '';
      return ok(`https://wa.me/${digits}${query}`);
    }
    case 'vcard': {
      const f = fields as QrFields['vcard'];
      if (!f.firstName.trim() && !f.lastName.trim()) return fail('Enter at least a first or last name.');
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${escapeVcard(f.lastName)};${escapeVcard(f.firstName)};;;`,
        `FN:${escapeVcard(`${f.firstName} ${f.lastName}`.trim())}`,
      ];
      if (f.organization) lines.push(`ORG:${escapeVcard(f.organization)}`);
      if (f.title) lines.push(`TITLE:${escapeVcard(f.title)}`);
      if (f.phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(f.phone)}`);
      if (f.email) lines.push(`EMAIL:${escapeVcard(f.email)}`);
      if (f.website) lines.push(`URL:${escapeVcard(f.website)}`);
      if (f.address) lines.push(`ADR:;;${escapeVcard(f.address)};;;;`);
      lines.push('END:VCARD');
      return ok(lines.join('\n'));
    }
    case 'mecard': {
      const f = fields as QrFields['mecard'];
      if (!f.firstName.trim() && !f.lastName.trim()) return fail('Enter at least a first or last name.');
      const parts = [`N:${escapeVcard(f.lastName)},${escapeVcard(f.firstName)};`];
      if (f.phone) parts.push(`TEL:${escapeVcard(f.phone)};`);
      if (f.email) parts.push(`EMAIL:${escapeVcard(f.email)};`);
      if (f.address) parts.push(`ADR:${escapeVcard(f.address)};`);
      return ok(`MECARD:${parts.join('')};`);
    }
    case 'wifi': {
      const f = fields as QrFields['wifi'];
      if (!f.ssid.trim()) return fail('Enter the network name.');
      if (f.encryption !== 'nopass' && !f.password) return fail('Enter the network password.');
      return ok(
        `WIFI:T:${f.encryption};S:${escapeWifi(f.ssid)};${
          f.encryption === 'nopass' ? '' : `P:${escapeWifi(f.password)};`
        }H:${f.hidden ? 'true' : 'false'};;`,
      );
    }
    case 'location': {
      const { latitude, longitude } = fields as QrFields['location'];
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!latitude.trim() || !longitude.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
        return fail('Enter a valid latitude and longitude.');
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return fail('Coordinates are out of range.');
      return ok(`geo:${lat},${lng}`);
    }
    case 'event': {
      const f = fields as QrFields['event'];
      if (!f.title.trim()) return fail('Enter an event title.');
      if (!f.start.trim()) return fail('Enter a start date and time.');
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        `SUMMARY:${escapeIcal(f.title)}`,
        `DTSTART:${toIcalDate(f.start)}`,
      ];
      if (f.end) lines.push(`DTEND:${toIcalDate(f.end)}`);
      if (f.location) lines.push(`LOCATION:${escapeIcal(f.location)}`);
      if (f.description) lines.push(`DESCRIPTION:${escapeIcal(f.description)}`);
      lines.push('END:VEVENT', 'END:VCALENDAR');
      return ok(lines.join('\n'));
    }
    case 'crypto': {
      const { address, amount } = fields as QrFields['crypto'];
      if (!address.trim()) return fail('Enter a wallet address.');
      const query = amount ? `?amount=${encodeURIComponent(amount)}` : '';
      return ok(`bitcoin:${address.trim()}${query}`);
    }
    case 'googlemaps': {
      const { query, latitude, longitude } = fields as QrFields['googlemaps'];
      if (latitude.trim() || longitude.trim()) {
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!latitude.trim() || !longitude.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
          return fail('Enter both a latitude and a longitude.');
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return fail('Coordinates are out of range.');
        return ok(`geo:${lat},${lng}`);
      }
      const trimmed = query.trim();
      if (!trimmed) return fail('Enter a place, address, or paste a Google Maps link.');
      const extracted = extractGeoFromMapsUrl(trimmed);
      if (extracted) return ok(`geo:${extracted.lat},${extracted.lng}`);
      if (/^https?:\/\//i.test(trimmed)) return ok(trimmed);
      const pair = GEO_PAIR_RE.exec(trimmed);
      if (pair) return ok(`geo:${pair[1]},${pair[2]}`);
      return ok(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`);
    }
    case 'universal': {
      const { value } = fields as QrFields['universal'];
      const trimmed = value.trim();
      if (!trimmed) return fail('Type or paste anything to encode.');
      return ok(detectUniversal(trimmed));
    }
    default:
      return fail('Choose a QR type.');
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()-]{6,}$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

/** What the Universal type will actually encode, shown to the user before they generate. */
export function detectUniversal(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (EMAIL_RE.test(trimmed)) return `mailto:${trimmed}`;
  if (PHONE_RE.test(trimmed) && /\d{6,}/.test(trimmed.replace(/\D/g, ''))) {
    return `tel:${trimmed.replace(/[^\d+]/g, '')}`;
  }
  if (DOMAIN_RE.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}
