'use client';

import { detectUniversal, SIMPLE_LINK_TYPES, type QrFields, type QrTypeId } from './qr_content';

const inputClass =
  'border-border bg-background text-foreground focus:border-brand w-full rounded-xl border px-3 py-2 text-sm outline-none';
const labelClass = 'text-foreground flex flex-col gap-1.5 text-sm font-medium';
const hintClass = 'text-muted text-xs font-normal';

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className={labelClass}>
      {children}
      {hint && <span className={hintClass}>{hint}</span>}
    </span>
  );
}

interface ContentFieldsProps<T extends QrTypeId> {
  type: T;
  fields: QrFields[T];
  onChange: (patch: Partial<QrFields[T]>) => void;
}

export function ContentFields<T extends QrTypeId>({ type, fields, onChange }: ContentFieldsProps<T>) {
  const simpleLink = SIMPLE_LINK_TYPES[type];
  if (simpleLink) {
    const f = fields as QrFields['website'];
    return (
      <label className={labelClass}>
        {simpleLink.fieldLabel}
        <input
          className={inputClass}
          value={f.value}
          onChange={(e) => onChange({ value: e.target.value } as unknown as Partial<QrFields[T]>)}
          placeholder={simpleLink.placeholder}
        />
      </label>
    );
  }

  switch (type) {
    case 'url': {
      const f = fields as QrFields['url'];
      return (
        <label className={labelClass}>
          Website URL
          <input
            className={inputClass}
            value={f.url}
            onChange={(e) => onChange({ url: e.target.value } as unknown as Partial<QrFields[T]>)}
            placeholder="https://example.com"
            inputMode="url"
          />
        </label>
      );
    }
    case 'text': {
      const f = fields as QrFields['text'];
      return (
        <label className={labelClass}>
          Text
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={f.text}
            onChange={(e) => onChange({ text: e.target.value } as unknown as Partial<QrFields[T]>)}
            placeholder="Anything you like"
          />
        </label>
      );
    }
    case 'email': {
      const f = fields as QrFields['email'];
      return (
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            To
            <input
              className={inputClass}
              value={f.to}
              onChange={(e) => onChange({ to: e.target.value } as unknown as Partial<QrFields[T]>)}
              placeholder="name@example.com"
              inputMode="email"
            />
          </label>
          <label className={labelClass}>
            Subject (optional)
            <input
              className={inputClass}
              value={f.subject}
              onChange={(e) => onChange({ subject: e.target.value } as unknown as Partial<QrFields[T]>)}
            />
          </label>
          <label className={labelClass}>
            Message (optional)
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={f.body}
              onChange={(e) => onChange({ body: e.target.value } as unknown as Partial<QrFields[T]>)}
            />
          </label>
        </div>
      );
    }
    case 'phone': {
      const f = fields as QrFields['phone'];
      return (
        <label className={labelClass}>
          Phone number
          <input
            className={inputClass}
            value={f.number}
            onChange={(e) => onChange({ number: e.target.value } as unknown as Partial<QrFields[T]>)}
            placeholder="+1 555 000 0000"
            inputMode="tel"
          />
        </label>
      );
    }
    case 'sms': {
      const f = fields as QrFields['sms'];
      return (
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            Phone number
            <input
              className={inputClass}
              value={f.number}
              onChange={(e) => onChange({ number: e.target.value } as unknown as Partial<QrFields[T]>)}
              placeholder="+1 555 000 0000"
              inputMode="tel"
            />
          </label>
          <label className={labelClass}>
            Message (optional)
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={f.message}
              onChange={(e) => onChange({ message: e.target.value } as unknown as Partial<QrFields[T]>)}
            />
          </label>
        </div>
      );
    }
    case 'whatsapp': {
      const f = fields as QrFields['whatsapp'];
      return (
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            <Label hint="Include the country code, no plus sign or spaces needed.">Phone number</Label>
            <input
              className={inputClass}
              value={f.number}
              onChange={(e) => onChange({ number: e.target.value } as unknown as Partial<QrFields[T]>)}
              placeholder="15550000000"
              inputMode="tel"
            />
          </label>
          <label className={labelClass}>
            Prefilled message (optional)
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={f.message}
              onChange={(e) => onChange({ message: e.target.value } as unknown as Partial<QrFields[T]>)}
            />
          </label>
        </div>
      );
    }
    case 'vcard': {
      const f = fields as QrFields['vcard'];
      const set = (patch: Partial<QrFields['vcard']>) => onChange(patch as unknown as Partial<QrFields[T]>);
      return (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            First name
            <input className={inputClass} value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          </label>
          <label className={labelClass}>
            Last name
            <input className={inputClass} value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </label>
          <label className={`${labelClass} col-span-2`}>
            Organization
            <input
              className={inputClass}
              value={f.organization}
              onChange={(e) => set({ organization: e.target.value })}
            />
          </label>
          <label className={`${labelClass} col-span-2`}>
            Job title
            <input className={inputClass} value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className={labelClass}>
            Phone
            <input className={inputClass} value={f.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" />
          </label>
          <label className={labelClass}>
            Email
            <input className={inputClass} value={f.email} onChange={(e) => set({ email: e.target.value })} inputMode="email" />
          </label>
          <label className={`${labelClass} col-span-2`}>
            Website
            <input className={inputClass} value={f.website} onChange={(e) => set({ website: e.target.value })} />
          </label>
          <label className={`${labelClass} col-span-2`}>
            Address
            <input className={inputClass} value={f.address} onChange={(e) => set({ address: e.target.value })} />
          </label>
        </div>
      );
    }
    case 'mecard': {
      const f = fields as QrFields['mecard'];
      const set = (patch: Partial<QrFields['mecard']>) => onChange(patch as unknown as Partial<QrFields[T]>);
      return (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            First name
            <input className={inputClass} value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          </label>
          <label className={labelClass}>
            Last name
            <input className={inputClass} value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </label>
          <label className={labelClass}>
            Phone
            <input className={inputClass} value={f.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" />
          </label>
          <label className={labelClass}>
            Email
            <input className={inputClass} value={f.email} onChange={(e) => set({ email: e.target.value })} inputMode="email" />
          </label>
          <label className={`${labelClass} col-span-2`}>
            Address
            <input className={inputClass} value={f.address} onChange={(e) => set({ address: e.target.value })} />
          </label>
        </div>
      );
    }
    case 'wifi': {
      const f = fields as QrFields['wifi'];
      const set = (patch: Partial<QrFields['wifi']>) => onChange(patch as unknown as Partial<QrFields[T]>);
      return (
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            Network name (SSID)
            <input className={inputClass} value={f.ssid} onChange={(e) => set({ ssid: e.target.value })} />
          </label>
          <label className={labelClass}>
            Security
            <select
              className={inputClass}
              value={f.encryption}
              onChange={(e) => set({ encryption: e.target.value as QrFields['wifi']['encryption'] })}
            >
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">None (open network)</option>
            </select>
          </label>
          {f.encryption !== 'nopass' && (
            <label className={labelClass}>
              Password
              <input
                className={inputClass}
                value={f.password}
                onChange={(e) => set({ password: e.target.value })}
                type="text"
              />
            </label>
          )}
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.hidden}
              onChange={(e) => set({ hidden: e.target.checked })}
              className="accent-brand size-4"
            />
            Hidden network
          </label>
        </div>
      );
    }
    case 'location': {
      const f = fields as QrFields['location'];
      const set = (patch: Partial<QrFields['location']>) => onChange(patch as unknown as Partial<QrFields[T]>);
      return (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Latitude
            <input
              className={inputClass}
              value={f.latitude}
              onChange={(e) => set({ latitude: e.target.value })}
              placeholder="37.7749"
              inputMode="decimal"
            />
          </label>
          <label className={labelClass}>
            Longitude
            <input
              className={inputClass}
              value={f.longitude}
              onChange={(e) => set({ longitude: e.target.value })}
              placeholder="-122.4194"
              inputMode="decimal"
            />
          </label>
        </div>
      );
    }
    case 'googlemaps': {
      const f = fields as QrFields['googlemaps'];
      const set = (patch: Partial<QrFields['googlemaps']>) => onChange(patch as unknown as Partial<QrFields[T]>);
      const hasCoords = f.latitude.trim() !== '' || f.longitude.trim() !== '';
      return (
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            Google Maps link
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={f.query}
                onChange={(e) => set({ query: e.target.value })}
                placeholder="https://maps.google.com/…"
                disabled={hasCoords}
              />
              {!/^https?:\/\//i.test(f.query.trim()) && (
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.query.trim() || 'a place')}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                  className="border-border text-muted hover:text-foreground hover:bg-surface-muted shrink-0 rounded-xl border px-3 text-xs font-medium"
                >
                  Find it
                </button>
              )}
            </div>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Or latitude
              <input
                className={inputClass}
                value={f.latitude}
                onChange={(e) => set({ latitude: e.target.value })}
                placeholder="37.4220"
                inputMode="decimal"
              />
            </label>
            <label className={labelClass}>
              Longitude
              <input
                className={inputClass}
                value={f.longitude}
                onChange={(e) => set({ longitude: e.target.value })}
                placeholder="-122.0841"
                inputMode="decimal"
              />
            </label>
          </div>
        </div>
      );
    }
    case 'event': {
      const f = fields as QrFields['event'];
      const set = (patch: Partial<QrFields['event']>) => onChange(patch as unknown as Partial<QrFields[T]>);
      return (
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            Title
            <input className={inputClass} value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Starts
              <input
                className={inputClass}
                type="datetime-local"
                value={f.start}
                onChange={(e) => set({ start: e.target.value })}
              />
            </label>
            <label className={labelClass}>
              Ends (optional)
              <input
                className={inputClass}
                type="datetime-local"
                value={f.end}
                onChange={(e) => set({ end: e.target.value })}
              />
            </label>
          </div>
          <label className={labelClass}>
            Location (optional)
            <input className={inputClass} value={f.location} onChange={(e) => set({ location: e.target.value })} />
          </label>
          <label className={labelClass}>
            Notes (optional)
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={f.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
        </div>
      );
    }
    case 'crypto': {
      const f = fields as QrFields['crypto'];
      const set = (patch: Partial<QrFields['crypto']>) => onChange(patch as unknown as Partial<QrFields[T]>);
      return (
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            Bitcoin wallet address
            <input className={inputClass} value={f.address} onChange={(e) => set({ address: e.target.value })} spellCheck={false} />
          </label>
          <label className={labelClass}>
            Amount (optional)
            <input className={inputClass} value={f.amount} onChange={(e) => set({ amount: e.target.value })} inputMode="decimal" />
          </label>
        </div>
      );
    }
    case 'universal': {
      const f = fields as QrFields['universal'];
      const preview = f.value.trim() ? detectUniversal(f.value) : '';
      return (
        <label className={labelClass}>
          <Label hint="A link, email address or phone number is recognised and formatted automatically.">
            Anything
          </Label>
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={f.value}
            onChange={(e) => onChange({ value: e.target.value } as unknown as Partial<QrFields[T]>)}
            placeholder="example.com, name@example.com, +1 555 000 0000…"
          />
          {preview && <span className="text-muted truncate text-xs">Will encode as: {preview}</span>}
        </label>
      );
    }
    default:
      return null;
  }
}
