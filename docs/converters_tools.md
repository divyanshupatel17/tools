# Converters: planning

Single source of truth for what the Converters category will contain. Registry entries live in
`apps/web/lib/tools/registry.ts`. Converters has **7 tools**, no declared sections
(`lib/tools/sections.ts`) — small enough to render as one flat grid. None are built yet; follow
`docs/architecture.md`'s "Adding a tool" steps as each one starts.

Everything is a pure numeric or unit conversion; all but one run entirely client side with no
Web Worker or WASM needed. Currency Converter is the one exception (`client_only: false`):
exchange rates cannot be computed offline, so it needs a fetch to a rates source, kept to that
one tool and nowhere else in the category.

## Checklist

- [ ] Unit Converter — `unit-converter`
- [ ] Time Converter — `time-converter`
- [ ] Currency Converter — `currency-converter`
- [ ] Temperature Converter — `temperature-converter`
- [ ] Length Converter — `length-converter`
- [ ] Weight Converter — `weight-converter`
- [ ] Data Converter — `data-converter`

## Converters

### 1. Unit Converter — `unit-converter`

| Feature | Details |
| --- | --- |
| Categories | Length, area, volume and speed, metric and imperial in either direction. |
| Live | Result updates as the value or either unit changes, no button press needed. |

SEO: Unit Converter, Metric to Imperial Converter.

### 2. Time Converter — `time-converter`

| Feature | Details |
| --- | --- |
| Time zones | Convert a time between named time zones. |
| Units | Seconds, minutes, hours and days, converted between each other. |

SEO: Time Zone Converter, Time Unit Converter.

### 3. Currency Converter — `currency-converter`

| Feature | Details |
| --- | --- |
| Rates | Recent published exchange rates; the only tool in this project that is not `client_only`. |
| Pairs | Convert between any two supported currencies. |

SEO: Currency Converter, Exchange Rate Calculator.

### 4. Temperature Converter — `temperature-converter`

| Feature | Details |
| --- | --- |
| Units | Celsius, Fahrenheit and Kelvin, converted between any pair. |

SEO: Temperature Converter, Celsius to Fahrenheit.

### 5. Length Converter — `length-converter`

| Feature | Details |
| --- | --- |
| Units | Millimetres, centimetres, metres, kilometres, inches, feet and miles. |

SEO: Length Converter, Inches to Centimeters.

### 6. Weight Converter — `weight-converter`

| Feature | Details |
| --- | --- |
| Units | Grams, kilograms, tonnes, ounces, pounds and stones. |

SEO: Weight Converter, Kg to Pounds.

### 7. Data Converter — `data-converter`

| Feature | Details |
| --- | --- |
| Units | Bytes, kilobytes, megabytes, gigabytes and terabytes. |

SEO: Data Size Converter, MB to GB.

## Shared conventions to build against

- Every tool computes live as either value changes; no tool in this category should require a
  button press to see a result.
- No hyphens or dashes in user facing text. Control panel copy stays a label plus a short
  caveat, never a paragraph of engineering explanation.
