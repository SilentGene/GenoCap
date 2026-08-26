import Papa from 'papaparse';
import type { AnnotationRecord, DatabaseEntry, FileKind, InputValidationError, ParsedAnnotations } from './types';

const REQUIRED_HEADERS = ['gene', 'genome', 'ko'] as const;
const KO_PATTERN = /^K\d{5}$/;

export function splitKoCell(raw: string): { kos: string[]; reason?: string } {
  const value = raw.trim();
  if (!value) return { kos: [] };
  const tokens = value.split(/[;,|]/).map((token) => token.trim());
  if (tokens.some((token) => token.length === 0)) {
    return { kos: [], reason: 'Empty KO between separators or after a trailing separator.' };
  }
  const invalid = tokens.find((token) => !KO_PATTERN.test(token));
  if (invalid) return { kos: [], reason: `Unrecognized KO token “${invalid}”. Expected K followed by five digits.` };
  return { kos: [...new Set(tokens)] };
}

export function parseAnnotations(text: string, kind: FileKind, database: DatabaseEntry[]): ParsedAnnotations {
  const cleanText = text.replace(/^\uFEFF/, '');
  const parsed = Papa.parse<string[]>(cleanText, {
    delimiter: kind === 'tsv' ? '\t' : ',',
    quoteChar: '"',
    escapeChar: '"',
    skipEmptyLines: false,
  });
  const errors: InputValidationError[] = [];
  const rows = parsed.data;
  const header = rows[0] ?? [];

  if (!cleanText.trim()) {
    errors.push({ line: 1, field: 'file', value: '', reason: 'The file is empty.' });
    return emptyResult(errors);
  }

  for (const required of REQUIRED_HEADERS) {
    if (!header.includes(required)) {
      errors.push({ line: 1, field: 'header', value: header.join(kind === 'tsv' ? '\\t' : ','), reason: `Required header “${required}” is missing.` });
    }
  }
  if (new Set(header).size !== header.length) {
    errors.push({ line: 1, field: 'header', value: header.join(kind === 'tsv' ? '\\t' : ','), reason: 'Header names must be unique.' });
  }
  if (errors.length) return emptyResult(errors);

  const index = Object.fromEntries(header.map((name, position) => [name, position]));
  const parserErrorRows = new Map<number, string[]>();
  for (const error of parsed.errors) {
    const line = (error.row ?? 0) + 1;
    parserErrorRows.set(line, [...(parserErrorRows.get(line) ?? []), error.message]);
  }

  const records: AnnotationRecord[] = [];
  const genomes: string[] = [];
  const seenGenomes = new Set<string>();
  const uniqueKos = new Set<string>();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const sourceLine = rowIndex + 1;
    if (row.every((field) => !field.trim())) continue;
    if (row.length !== header.length || parserErrorRows.has(sourceLine)) {
      errors.push({ line: sourceLine, field: 'row', value: row.join(kind === 'tsv' ? '\\t' : ','), reason: parserErrorRows.get(sourceLine)?.join(' ') ?? `Expected ${header.length} columns but found ${row.length}.` });
      continue;
    }

    const gene = row[index.gene]?.trim() ?? '';
    const genome = row[index.genome]?.trim() ?? '';
    const koRaw = row[index.ko] ?? '';
    if (!gene) errors.push({ line: sourceLine, field: 'gene', value: row[index.gene] ?? '', reason: 'Gene is required.' });
    if (!genome) errors.push({ line: sourceLine, field: 'genome', value: row[index.genome] ?? '', reason: 'Genome is required.' });
    const koResult = splitKoCell(koRaw);
    if (koResult.reason) errors.push({ line: sourceLine, field: 'ko', value: koRaw, reason: koResult.reason });
    if (!gene || !genome || koResult.reason) continue;

    if (!seenGenomes.has(genome)) { seenGenomes.add(genome); genomes.push(genome); }
    koResult.kos.forEach((ko) => uniqueKos.add(ko));
    records.push({ gene, genome, kos: koResult.kos, sourceLine });
  }

  if (!errors.length && genomes.length === 0) {
    errors.push({ line: 1, field: 'file', value: '', reason: 'No genome records were found.' });
  }
  const databaseKos = new Set(database.map((entry) => entry.ko));
  const matchedKos = [...uniqueKos].filter((ko) => databaseKos.has(ko)).length;
  return { records, genomes, errors, summary: { records: records.length, genomes: genomes.length, uniqueKos: uniqueKos.size, matchedKos } };
}

function emptyResult(errors: InputValidationError[]): ParsedAnnotations {
  return { records: [], genomes: [], errors, summary: { records: 0, genomes: 0, uniqueKos: 0, matchedKos: 0 } };
}
