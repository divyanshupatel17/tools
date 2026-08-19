'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Braces,
  Check,
  Clipboard,
  Copy,
  Download,
  Plus,
  Repeat,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';
import {
  buildQueryString,
  jsonToParams,
  parseQueryString,
  paramsToJson,
  type ParamType,
  type QueryParam,
} from './query_string_ops';

const AUTOSAVE_KEY = 'developer-tool:url-query-string';
type Mode = 'query-to-json' | 'json-to-query';

function encodedValue(value: string): string {
  return encodeURIComponent(value);
}

export function UrlQueryStringWorkspace() {
  const [mode, setMode] = useState<Mode>('query-to-json');
  const [queryString, setQueryString] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [params, setParams] = useState<QueryParam[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState<ParamType>('Text');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = window.localStorage.getItem(AUTOSAVE_KEY);
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQueryString(draft);
      setParams(parseQueryString(draft));
    }
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    if (queryString === '') {
      window.localStorage.removeItem(AUTOSAVE_KEY);
    } else {
      window.localStorage.setItem(AUTOSAVE_KEY, queryString);
    }
  }, [queryString]);

  const jsonOutput = useMemo(() => JSON.stringify(paramsToJson(params), null, 2), [params]);
  const queryOutput = useMemo(() => buildQueryString(params), [params]);
  const output = mode === 'query-to-json' ? jsonOutput : queryOutput;
  const outputLines = output.split('\n');

  function switchMode(next: Mode) {
    setMode(next);
    setNotice(null);
  }

  function convertQueryToJson() {
    setNotice(null);
    setParams(parseQueryString(queryString));
  }

  function convertJsonToQuery() {
    const result = jsonToParams(jsonInput);
    if (!result.ok) {
      setNotice(result.message ?? 'That is not valid JSON.');
      return;
    }
    setNotice(null);
    setParams(result.params);
    setQueryString(buildQueryString(result.params));
  }

  async function handlePaste() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (mode === 'query-to-json') setQueryString(clipboardText);
      else setJsonInput(clipboardText);
    } catch {
      setNotice('Could not read from clipboard. Paste manually instead.');
    }
  }

  function handleClearInput() {
    if (mode === 'query-to-json') setQueryString('');
    else setJsonInput('');
  }

  function clearAll() {
    setQueryString('');
    setJsonInput('');
    setParams([]);
    setNotice(null);
  }

  async function handleImport(file: File) {
    setNotice(null);
    try {
      const text = await importTextFile(file);
      if (mode === 'query-to-json') {
        setQueryString(text);
        setParams(parseQueryString(text));
      } else {
        setJsonInput(text);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be imported.');
    }
  }

  function handleExport() {
    if (output.trim() === '' || params.length === 0) return;
    const fileName = mode === 'query-to-json' ? 'query-params.json' : 'query-string.txt';
    const mimeType = mode === 'query-to-json' ? 'application/json' : 'text/plain';
    downloadBlob(new Blob([output], { type: mimeType }), fileName);
  }

  async function copyOutput() {
    if (output.trim() === '') return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function addParameter() {
    if (newKey.trim() === '') return;
    const next = [...params, { key: newKey.trim(), value: newValue, type: newType }];
    setParams(next);
    setQueryString(buildQueryString(next));
    setNewKey('');
    setNewValue('');
    setNewType('Text');
  }

  function removeParameter(index: number) {
    const next = params.filter((_, i) => i !== index);
    setParams(next);
    setQueryString(buildQueryString(next));
  }

  const inputValue = mode === 'query-to-json' ? queryString : jsonInput;

  return (
    <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="border-border flex items-center gap-1 border-b">
          <button
            type="button"
            onClick={() => switchMode('query-to-json')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              mode === 'query-to-json'
                ? 'border-brand text-foreground'
                : 'text-muted border-transparent hover:text-foreground'
            }`}
          >
            <Repeat aria-hidden className="size-4" />
            Query String to JSON
          </button>
          <button
            type="button"
            onClick={() => switchMode('json-to-query')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              mode === 'json-to-query'
                ? 'border-brand text-foreground'
                : 'text-muted border-transparent hover:text-foreground'
            }`}
          >
            <Braces aria-hidden className="size-4" />
            JSON to Query String
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={clearAll} disabled={inputValue === '' && params.length === 0}>
            <Trash2 aria-hidden className="size-4" />
            Clear All
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Download aria-hidden className="size-4" />
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={TEXT_IMPORT_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleImport(file);
            }}
          />
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={params.length === 0}>
            <Upload aria-hidden className="size-4" />
            Export
          </Button>
        </div>
      </div>

      {notice && <Notice>{notice}</Notice>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">{mode === 'query-to-json' ? 'Query String' : 'JSON Input'}</p>
            <textarea
              value={inputValue}
              onChange={(event) =>
                mode === 'query-to-json' ? setQueryString(event.target.value) : setJsonInput(event.target.value)
              }
              placeholder={
                mode === 'query-to-json' ? 'Enter query string here…' : 'Enter JSON here…'
              }
              spellCheck={false}
              className="border-border bg-background h-24 min-h-[6rem] resize-y rounded-2xl border p-4 font-mono text-sm leading-6 outline-none"
            />
            <p className="text-muted text-xs">
              {mode === 'query-to-json'
                ? 'Example: name=John&age=30&city=New%20York&active=true'
                : 'Example: {"name": "John", "age": 30, "active": true}'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void handlePaste()}>
                <Clipboard aria-hidden className="size-4" />
                Paste
              </Button>
              <Button variant="secondary" size="sm" onClick={handleClearInput} disabled={inputValue === ''}>
                <Trash2 aria-hidden className="size-4" />
                Clear
              </Button>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={mode === 'query-to-json' ? convertQueryToJson : convertJsonToQuery}
              disabled={inputValue.trim() === ''}
            >
              {mode === 'query-to-json' ? 'Convert to JSON' : 'Convert to Query String'}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Quick Add Parameter</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="quick-add-key"
                name="quick-add-key"
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="Key (e.g. name)"
                className="border-border bg-background min-w-[120px] flex-1 rounded-full border px-3 py-2 text-sm outline-none"
              />
              <input
                id="quick-add-value"
                name="quick-add-value"
                value={newValue}
                onChange={(event) => setNewValue(event.target.value)}
                placeholder="Value (e.g. John Doe)"
                className="border-border bg-background min-w-[140px] flex-1 rounded-full border px-3 py-2 text-sm outline-none"
              />
              <select
                id="quick-add-type"
                name="quick-add-type"
                value={newType}
                onChange={(event) => setNewType(event.target.value as ParamType)}
                className="border-border bg-background rounded-full border px-3 py-2 text-sm outline-none"
                aria-label="Parameter type"
              >
                <option value="Text">Text</option>
                <option value="Number">Number</option>
                <option value="Boolean">Boolean</option>
              </select>
              <Button variant="primary" size="sm" onClick={addParameter} disabled={newKey.trim() === ''}>
                <Plus aria-hidden className="size-4" />
                Add
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Query Parameters</p>
              <span className="text-success bg-success/10 rounded-full px-2 py-0.5 text-xs font-medium">
                {params.length}
              </span>
            </div>
            {params.length === 0 ? (
              <div className="text-muted border-border bg-background flex flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-10 text-center text-sm">
                <Search aria-hidden className="size-6" />
                <p>No parameters found.</p>
                <p className="text-xs">Add parameters using the form above.</p>
              </div>
            ) : (
              <div className="border-border overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="text-muted border-border border-b text-xs font-medium">
                      <th className="px-4 py-2">Key</th>
                      <th className="px-4 py-2">Value</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Encoded Value</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {params.map((param, index) => (
                      <tr key={`${param.key}-${index}`}>
                        <td className="text-brand-strong px-4 py-2.5 font-mono font-medium">{param.key}</td>
                        <td className="max-w-[140px] truncate px-4 py-2.5 font-mono">{param.value}</td>
                        <td className="text-muted px-4 py-2.5">{param.type}</td>
                        <td className="text-muted max-w-[140px] truncate px-4 py-2.5 font-mono text-xs">
                          {encodedValue(param.value)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeParameter(index)}
                            aria-label={`Remove ${param.key}`}
                            className="text-muted hover:text-danger"
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{mode === 'query-to-json' ? 'JSON Output' : 'Query String Output'}</p>
            <Button variant="secondary" size="sm" onClick={() => void copyOutput()} disabled={output.trim() === ''}>
              {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              Copy
            </Button>
          </div>
          <div className="border-border bg-background flex rounded-2xl border font-mono text-sm leading-6">
            <div className="text-muted border-border shrink-0 border-r px-3 py-4 text-right select-none">
              {outputLines.map((_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
            </div>
            <pre className="min-w-0 flex-1 overflow-auto px-3 py-4 whitespace-pre-wrap break-words">{output}</pre>
          </div>
          <p className="text-muted text-xs">{params.length} keys</p>
        </div>
      </div>
    </div>
  );
}
