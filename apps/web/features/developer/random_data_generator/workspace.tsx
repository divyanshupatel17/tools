'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Copy, Dices, Download, Plus, Trash2 } from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { downloadBlob } from '@/lib/browser/download';
import {
  FIELD_KEYS,
  FIELD_LABELS,
  generateRecord,
  generateRecords,
  toCsv,
  type CsvDelimiter,
  type CustomField,
  type CustomFieldType,
  type FieldKey,
  type OutputFormat,
} from './data_gen';

const MIN_COUNT = 1;
const MAX_COUNT = 10000;
const CUSTOM_FIELD_TYPES: CustomFieldType[] = ['Text', 'Number', 'Boolean', 'Date'];

function LineNumberedOutput({ content }: { content: string }) {
  // A generated data set can run to tens of thousands of lines. Rendering one <div> per line
  // number (as other line-numbered panels in this app do) creates that many DOM nodes and
  // freezes the tab, so the numbers render as a single text block instead, same as the content.
  const lineCount = content === '' ? 1 : content.split('\n').length;
  const numbers = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');
  return (
    <div className="border-border bg-background flex rounded-2xl border font-mono text-sm leading-6">
      <pre className="text-muted border-border shrink-0 border-r px-3 py-4 text-right select-none">{numbers}</pre>
      <pre className="min-w-0 flex-1 overflow-auto px-3 py-4 whitespace-pre-wrap break-words">{content}</pre>
    </div>
  );
}

export function RandomDataGeneratorWorkspace() {
  const [format, setFormat] = useState<OutputFormat>('json');
  const [count, setCount] = useState(10);
  const [fields, setFields] = useState<Set<FieldKey>>(new Set(FIELD_KEYS));
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<CustomFieldType>('Text');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [minifyJson, setMinifyJson] = useState(false);
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(',');
  const [records, setRecords] = useState<Record<string, unknown>[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const selectedFields = FIELD_KEYS.filter((field) => fields.has(field));
  const validCustomFields = customFields.filter((field) => field.name.trim() !== '');
  const hasSelection = selectedFields.length > 0 || validCustomFields.length > 0;

  // Random values are generated client side only. Computing them during the render that SSR
  // also runs would embed one random record in the server HTML and a different one on the
  // client's first render, which React treats as a hydration mismatch.
  const [previewRecord, setPreviewRecord] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewRecord(generateRecord(selectedFields, validCustomFields));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, customFields]);

  const previewContent = previewRecord
    ? format === 'csv'
      ? toCsv([previewRecord], delimiter)
      : JSON.stringify(previewRecord, null, minifyJson ? 0 : 2)
    : '';

  const outputContent = records
    ? format === 'csv'
      ? toCsv(records, delimiter)
      : JSON.stringify(records, null, minifyJson ? 0 : 2)
    : '';

  function toggleField(field: FieldKey, checked: boolean) {
    setFields((current) => {
      const next = new Set(current);
      if (checked) next.add(field);
      else next.delete(field);
      return next;
    });
  }

  function addCustomField() {
    if (customName.trim() === '') return;
    setCustomFields((current) => [...current, { name: customName.trim(), type: customType }]);
    setCustomName('');
    setCustomType('Text');
  }

  function removeCustomField(index: number) {
    setCustomFields((current) => current.filter((_, i) => i !== index));
  }

  function generate() {
    setNotice(null);
    if (!hasSelection) {
      setNotice('Select at least one field to generate.');
      return;
    }
    setRecords(generateRecords({ fields: selectedFields, customFields: validCustomFields, count }));
  }

  async function copyAll() {
    if (!records) return;
    await navigator.clipboard.writeText(outputContent);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  function downloadResults() {
    if (!records) return;
    const fileName = format === 'csv' ? 'random-data.csv' : 'random-data.json';
    const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
    downloadBlob(new Blob([outputContent], { type: mimeType }), fileName);
  }

  function clearAll() {
    setRecords(null);
    setNotice(null);
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs font-medium">Format</p>
            <div className="border-border bg-background flex items-center gap-1 rounded-full border p-1">
              {(['json', 'csv'] as OutputFormat[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  aria-pressed={format === value}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    format === value ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-muted text-xs font-medium">No. of Records</p>
            <NumberField
              value={count}
              onChange={setCount}
              min={MIN_COUNT}
              max={MAX_COUNT}
              id="random-data-count"
              aria-label="Number of records"
              className="border-border bg-background h-9 w-24 rounded-full border px-3 text-center text-sm outline-none"
            />
          </div>

          <Button variant="primary" size="sm" onClick={generate} disabled={!hasSelection}>
            <Dices aria-hidden className="size-4" />
            Generate Data
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copyAll()} disabled={!records}>
            {copiedAll ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            Copy
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadResults} disabled={!records}>
            <Download aria-hidden className="size-4" />
            Download
          </Button>
          <Button variant="secondary" size="sm" onClick={clearAll} disabled={!records}>
            <Trash2 aria-hidden className="size-4" />
            Clear
          </Button>
        </div>
      </div>

      {notice && <Notice>{notice}</Notice>}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Select Fields</p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
          {FIELD_KEYS.map((field) => (
            <label key={field} className="text-foreground flex items-center gap-2 text-sm">
              <input
                id={`random-data-field-${field}`}
                name={`random-data-field-${field}`}
                type="checkbox"
                checked={fields.has(field)}
                onChange={(event) => toggleField(field, event.target.checked)}
                className="accent-brand size-4"
              />
              {FIELD_LABELS[field]}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Add Custom Field</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="random-data-custom-name"
            name="random-data-custom-name"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="Field Name (e.g. age)"
            className="border-border bg-background min-w-[160px] flex-1 rounded-full border px-3 py-2 text-sm outline-none"
          />
          <select
            id="random-data-custom-type"
            name="random-data-custom-type"
            value={customType}
            onChange={(event) => setCustomType(event.target.value as CustomFieldType)}
            className="border-border bg-background rounded-full border px-3 py-2 text-sm outline-none"
            aria-label="Custom field type"
          >
            {CUSTOM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <Button variant="primary" size="sm" onClick={addCustomField} disabled={customName.trim() === ''}>
            <Plus aria-hidden className="size-4" />
            Add
          </Button>
        </div>
        {validCustomFields.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customFields.map((field, index) => (
              <span
                key={`${field.name}-${index}`}
                className="border-border bg-background flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
              >
                {field.name} <span className="text-muted">({field.type})</span>
                <button
                  type="button"
                  onClick={() => removeCustomField(index)}
                  aria-label={`Remove ${field.name}`}
                  className="text-muted hover:text-danger"
                >
                  <Trash2 aria-hidden className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
          aria-expanded={advancedOpen}
          className="text-foreground flex items-center gap-1.5 text-sm font-semibold"
        >
          <ChevronDown
            aria-hidden
            className={`size-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
          />
          Advanced Options
        </button>
        {advancedOpen && (
          <div className="border-border bg-background flex flex-wrap items-center gap-4 rounded-2xl border p-3">
            <label className="text-foreground flex items-center gap-2 text-sm">
              <input
                id="random-data-minify"
                name="random-data-minify"
                type="checkbox"
                checked={minifyJson}
                onChange={(event) => setMinifyJson(event.target.checked)}
                className="accent-brand size-4"
              />
              Minify JSON output
            </label>
            <label className="text-foreground flex items-center gap-2 text-sm">
              CSV delimiter
              <select
                id="random-data-delimiter"
                name="random-data-delimiter"
                value={delimiter}
                onChange={(event) => setDelimiter(event.target.value as CsvDelimiter)}
                className="border-border bg-surface rounded-full border px-2 py-1 text-sm outline-none"
              >
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value={'\t'}>Tab</option>
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Live Preview (1 record)</p>
          <LineNumberedOutput content={previewContent} />
          <p className="text-muted text-xs">Preview shows how each record will look.</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Generated Data</p>
            {records && (
              <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
                {records.length} {records.length === 1 ? 'record' : 'records'}
              </span>
            )}
          </div>
          {!records ? (
            <p className="text-muted border-border bg-background rounded-2xl border border-dashed px-4 py-8 text-center text-sm">
              No data generated yet. Choose your fields and click Generate Data.
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto rounded-2xl">
              <LineNumberedOutput content={outputContent} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
