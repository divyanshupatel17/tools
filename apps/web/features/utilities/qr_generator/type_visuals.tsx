'use client';

import {
  AudioLines,
  Calendar,
  Contact,
  Globe,
  IdCard,
  Link as LinkIcon,
  Mail,
  MapPin,
  MapPinned,
  MessageCircle,
  MessageSquare,
  Phone,
  Play,
  Send,
  Smartphone,
  Sparkles,
  Type,
  Video,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { QrTypeId } from './qr_content';

const TYPE_VISUALS: Record<QrTypeId, { background: string; icon?: LucideIcon; glyph?: string; radius?: 'rounded' | 'circle' }> = {
  url: { background: '#6366f1', icon: LinkIcon },
  text: { background: '#64748b', icon: Type },
  email: { background: '#ef4444', icon: Mail },
  phone: { background: '#22c55e', icon: Phone },
  sms: { background: '#ec4899', icon: MessageSquare },
  vcard: { background: '#f97316', icon: Contact },
  mecard: { background: '#fb923c', icon: IdCard },
  location: { background: '#ef4444', icon: MapPin },
  wifi: { background: '#0ea5e9', icon: Wifi },
  event: { background: '#8b5cf6', icon: Calendar },
  whatsapp: { background: '#25D366', icon: MessageCircle },
  telegram: { background: '#229ED9', icon: Send },
  facetime: { background: '#34C759', icon: Video },
  skype: { background: '#00AFF0', icon: Phone },
  twitter: { background: '#1DA1F2', glyph: 'X' },
  facebook: { background: '#1877F2', glyph: 'f' },
  instagram: { background: 'linear-gradient(135deg, #f58529, #dd2a7b 60%, #8134af)' },
  youtube: { background: '#FF0000', icon: Play, radius: 'rounded' },
  linkedin: { background: '#0A66C2', glyph: 'in' },
  spotify: { background: '#1DB954', icon: AudioLines },
  paypal: { background: '#003087', glyph: 'P' },
  pinterest: { background: '#E60023', glyph: 'P' },
  crypto: { background: '#F7931A', glyph: '₿' },
  website: { background: '#6366f1', icon: Globe },
  googlemaps: { background: '#EA4335', icon: MapPinned },
  appstore: { background: '#0D96F6', icon: Smartphone, radius: 'rounded' },
  playstore: { background: '#00C853', icon: Play, radius: 'rounded' },
  universal: { background: '#a855f7', icon: Sparkles },
};

/** A colourful per type badge: a brand coloured circle (or rounded square) with a white glyph
 *  inside, so the type grid reads at a glance instead of one uniform icon colour. Brand hexes
 *  are the platforms' own fixed identity colours, not site theme, so they are literal here by
 *  design rather than sourced from a CSS variable. */
export function TypeGlyph({ id, className }: { id: QrTypeId; className?: string }) {
  const visual = TYPE_VISUALS[id];
  const Icon = visual.icon;
  const isInstagram = id === 'instagram';
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center text-white ${visual.radius === 'rounded' ? 'rounded-lg' : 'rounded-full'} ${className ?? 'size-6'}`}
      style={{ background: visual.background }}
    >
      {isInstagram ? (
        <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      ) : Icon ? (
        <Icon aria-hidden className="size-[60%]" />
      ) : (
        <span className="text-[11px] leading-none font-bold">{visual.glyph}</span>
      )}
    </span>
  );
}
