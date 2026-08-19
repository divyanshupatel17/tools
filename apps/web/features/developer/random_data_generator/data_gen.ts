export type FieldKey =
  | 'fullName'
  | 'email'
  | 'phoneNumber'
  | 'number'
  | 'date'
  | 'uuid'
  | 'address'
  | 'username'
  | 'company';

export const FIELD_LABELS: Record<FieldKey, string> = {
  fullName: 'Full Name',
  email: 'Email',
  phoneNumber: 'Phone Number',
  number: 'Number',
  date: 'Date',
  uuid: 'UUID',
  address: 'Address',
  username: 'Username',
  company: 'Company',
};

export const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldKey[];

export type CustomFieldType = 'Text' | 'Number' | 'Boolean' | 'Date';

export interface CustomField {
  name: string;
  type: CustomFieldType;
}

export type OutputFormat = 'json' | 'csv';
export type CsvDelimiter = ',' | ';' | '\t';

export interface RandomDataOptions {
  fields: FieldKey[];
  customFields: CustomField[];
  count: number;
}

const FIRST_NAMES = [
  'John', 'Jane', 'Michael', 'Emily', 'David', 'Sarah', 'Robert', 'Laura', 'James', 'Anna',
  'William', 'Olivia', 'Daniel', 'Sophia', 'Matthew', 'Emma', 'Andrew', 'Grace', 'Joseph', 'Chloe',
];
const LAST_NAMES = [
  'Doe', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez',
  'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez',
];
const STREETS = [
  'Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Elm St', 'Park Ave', 'Washington Blvd', 'Sunset Rd',
  'Lake View Dr', 'Highland Ave',
];
const CITIES = [
  'Springfield', 'Franklin', 'Georgetown', 'Clinton', 'Salem', 'Fairview', 'Riverside', 'Greenville',
  'Bristol', 'Madison',
];
const STATES = ['IL', 'CA', 'NY', 'TX', 'WA', 'FL', 'OH', 'PA', 'GA', 'MI'];
const COMPANY_PREFIXES = ['Tech', 'Nova', 'Global', 'Prime', 'Bright', 'Rapid', 'Blue', 'Summit', 'Vertex', 'Quantum'];
const COMPANY_SUFFIXES = ['Solutions', 'Systems', 'Industries', 'Labs', 'Group', 'Partners', 'Works', 'Dynamics', 'Ventures', 'Networks'];
const EMAIL_DOMAINS = ['example.com', 'mail.com', 'test.io', 'sample.org', 'demo.net'];
const CUSTOM_TEXT_SAMPLES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Omega'];

function pick<T>(list: readonly T[]): T {
  const value = list[Math.floor(Math.random() * list.length)];
  if (value === undefined) throw new Error('pick() called with an empty list');
  return value;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(): string {
  const start = new Date(2018, 0, 1).getTime();
  const end = Date.now();
  const date = new Date(start + Math.random() * (end - start));
  return date.toISOString().slice(0, 10);
}

function randomPhone(): string {
  return `+1 ${randomInt(200, 999)}-555-${String(randomInt(0, 9999)).padStart(4, '0')}`;
}

function generateFieldValue(field: FieldKey, firstName: string, lastName: string): unknown {
  switch (field) {
    case 'fullName':
      return `${firstName} ${lastName}`;
    case 'email':
      return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${pick(EMAIL_DOMAINS)}`;
    case 'phoneNumber':
      return randomPhone();
    case 'number':
      return randomInt(1, 99999);
    case 'date':
      return randomDate();
    case 'uuid':
      return crypto.randomUUID();
    case 'address':
      return `${randomInt(100, 9999)} ${pick(STREETS)}, ${pick(CITIES)}, ${pick(STATES)} ${randomInt(10000, 99999)}, USA`;
    case 'username':
      return `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomInt(1, 99)}`;
    case 'company':
      return `${pick(COMPANY_PREFIXES)}${pick(COMPANY_SUFFIXES)}`;
  }
}

function generateCustomValue(type: CustomFieldType): unknown {
  switch (type) {
    case 'Text':
      return pick(CUSTOM_TEXT_SAMPLES);
    case 'Number':
      return randomInt(1, 1000);
    case 'Boolean':
      return Math.random() > 0.5;
    case 'Date':
      return randomDate();
  }
}

export function generateRecord(fields: FieldKey[], customFields: CustomField[]): Record<string, unknown> {
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const record: Record<string, unknown> = {};
  for (const field of fields) {
    record[field] = generateFieldValue(field, firstName, lastName);
  }
  for (const custom of customFields) {
    const name = custom.name.trim();
    if (name === '') continue;
    record[name] = generateCustomValue(custom.type);
  }
  return record;
}

export function generateRecords(options: RandomDataOptions): Record<string, unknown>[] {
  return Array.from({ length: options.count }, () => generateRecord(options.fields, options.customFields));
}

export function toCsv(records: Record<string, unknown>[], delimiter: CsvDelimiter = ','): string {
  const firstRecord = records[0];
  if (!firstRecord) return '';
  const headers = Object.keys(firstRecord);
  const escape = (value: unknown): string => {
    const str = String(value ?? '');
    if (str.includes('"') || str.includes(delimiter) || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.map(escape).join(delimiter)];
  for (const record of records) {
    lines.push(headers.map((header) => escape(record[header])).join(delimiter));
  }
  return lines.join('\n');
}
