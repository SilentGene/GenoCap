import Papa from 'papaparse';
import { splitKoCell } from './ko';
import type { DatabaseEntry } from './types';

export const DATABASE_HEADERS = ['Metabolism', 'Pathway', 'Module', 'KO', 'gene_name', 'if_key'] as const;

export interface DatabaseValidationError {
  line: number;
  field: string;
  value: string;
  reason: string;
}

export interface ParsedDatabase {
  entries: DatabaseEntry[];
  errors: DatabaseValidationError[];
}

export function parseDatabaseTsv(text: string): ParsedDatabase {
  const cleanText = text.replace(/^\uFEFF/, '');
  if (!cleanText.trim()) {
    return { entries: [], errors: [{ line: 1, field: 'file', value: '', reason: 'The database file is empty.' }] };
  }

  const parsed = Papa.parse<string[]>(cleanText, {
    delimiter: '\t',
    quoteChar: '"',
    escapeChar: '"',
    skipEmptyLines: false,
  });
  const rows = parsed.data;
  const header = rows[0] ?? [];
  const errors: DatabaseValidationError[] = [];

  for (const required of DATABASE_HEADERS) {
    if (!header.includes(required)) {
      errors.push({ line: 1, field: 'header', value: header.join('\\t'), reason: `Required header “${required}” is missing.` });
    }
  }
  if (new Set(header).size !== header.length) {
    errors.push({ line: 1, field: 'header', value: header.join('\\t'), reason: 'Header names must be unique.' });
  }
  if (errors.length) return { entries: [], errors };

  const indexes = Object.fromEntries(header.map((name, index) => [name, index]));
  const parserErrorRows = new Map<number, string[]>();
  for (const error of parsed.errors) {
    const line = (error.row ?? 0) + 1;
    parserErrorRows.set(line, [...(parserErrorRows.get(line) ?? []), error.message]);
  }

  const entries: DatabaseEntry[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const sourceLine = rowIndex + 1;
    if (row.every((field) => !field.trim())) continue;
    if (row.length !== header.length || parserErrorRows.has(sourceLine)) {
      errors.push({
        line: sourceLine,
        field: 'row',
        value: row.join('\\t'),
        reason: parserErrorRows.get(sourceLine)?.join(' ') ?? `Expected ${header.length} columns but found ${row.length}.`,
      });
      continue;
    }

    const metabolism = clean(row[indexes.Metabolism]);
    const pathway = clean(row[indexes.Pathway]);
    const moduleName = clean(row[indexes.Module]);
    const ko = clean(row[indexes.KO]);
    const koResult = splitKoCell(ko);
    const geneName = clean(row[indexes.gene_name]);
    const keyValue = clean(row[indexes.if_key]).toLowerCase();

    const requiredValues = [
      ['Metabolism', metabolism],
      ['Pathway', pathway],
      ['Module', moduleName],
      ['KO', ko],
      ['gene_name', geneName],
    ] as const;
    for (const [field, value] of requiredValues) {
      if (!value) errors.push({ line: sourceLine, field, value, reason: `${field} is required.` });
    }
    if (ko && koResult.reason) {
      errors.push({ line: sourceLine, field: 'KO', value: ko, reason: `${koResult.reason} Separate multiple KOs with commas, semicolons, or pipes.` });
    }
    if (keyValue && keyValue !== 'yes' && keyValue !== 'no') {
      errors.push({ line: sourceLine, field: 'if_key', value: keyValue, reason: 'Use “yes”, “no”, or leave the cell empty.' });
    }
    if (requiredValues.some(([, value]) => !value) || koResult.reason || koResult.kos.length === 0 || (keyValue !== '' && keyValue !== 'yes' && keyValue !== 'no')) continue;

    entries.push({ metabolism, pathway, module: moduleName, ko, geneName, isKey: keyValue === 'yes', sourceIndex: entries.length });
  }

  if (!errors.length && entries.length === 0) {
    errors.push({ line: 1, field: 'file', value: '', reason: 'No database records were found.' });
  }
  return { entries, errors };
}

export function mergeDatabaseEntries(current: DatabaseEntry[], uploaded: DatabaseEntry[], mode: 'append' | 'replace') {
  const source = mode === 'append' ? [...current, ...uploaded] : uploaded;
  const unique = new Map<string, DatabaseEntry>();
  for (const entry of source) {
    const key = [entry.metabolism, entry.pathway, entry.module, entry.ko, entry.geneName, entry.isKey ? 'yes' : ''].join('\u001f');
    if (!unique.has(key)) unique.set(key, entry);
  }
  const entries = [...unique.values()].map((entry, sourceIndex) => ({ ...entry, sourceIndex }));
  return { entries, duplicatesRemoved: source.length - entries.length };
}

export function databaseToTsv(entries: DatabaseEntry[]): string {
  const rows = entries.map((entry) => [entry.metabolism, entry.pathway, entry.module, entry.ko, entry.geneName, entry.isKey ? 'yes' : '']);
  return [DATABASE_HEADERS, ...rows].map((row) => row.map(tsvCell).join('\t')).join('\r\n');
}

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

function tsvCell(value: string): string {
  return /["\t\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
