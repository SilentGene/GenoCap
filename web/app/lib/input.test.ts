import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import databaseJson from '../data/genocap-db.json';
import { parseAnnotations, splitKoCell } from './input';
import type { DatabaseEntry } from './types';

const database = databaseJson as DatabaseEntry[];

describe('splitKoCell', () => {
  it('supports semicolon, comma, pipe, mixed separators and deduplication', () => {
    expect(splitKoCell(' K00001;K00002, K00003|K00001 ')).toEqual({ kos: ['K00001', 'K00002', 'K00003'] });
  });

  it('allows blank cells but rejects malformed tokens and empty segments', () => {
    expect(splitKoCell('')).toEqual({ kos: [] });
    expect(splitKoCell('K00001;;K00002').reason).toMatch(/Empty KO/);
    expect(splitKoCell('K1').reason).toMatch(/Unrecognized KO/);
  });
});

describe('parseAnnotations', () => {
  it('parses quoted CSV KO lists and CRLF newlines', () => {
    const text = 'gene,genome,ko,extra\r\ng1,A,"K00370,K02567",x\r\ng2,B,,y\r\n';
    const result = parseAnnotations(text, 'csv', database);
    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].kos).toEqual(['K00370', 'K02567']);
    expect(result.genomes).toEqual(['A', 'B']);
  });

  it('reports exact row numbers and blocks malformed unquoted CSV rows', () => {
    const result = parseAnnotations('gene,genome,ko\ng1,A,K00370,K02567\ng2,B,K0000X\n', 'csv', database);
    expect(result.errors.map((error) => error.line)).toEqual([2, 3]);
    expect(result.errors[0].field).toBe('row');
    expect(result.errors[1].field).toBe('ko');
  });

  it('requires exact headers', () => {
    const result = parseAnnotations('Gene\tgenome\tko\ng1\tA\tK00370', 'tsv', database);
    expect(result.errors[0]).toMatchObject({ line: 1, field: 'header' });
  });

  it('matches the supplied example dataset', () => {
    const sample = readFileSync(resolve(process.cwd(), '../doc/input_annotation.tsv'), 'utf8');
    const result = parseAnnotations(sample, 'tsv', database);
    expect(result.errors).toEqual([]);
    expect(result.summary).toEqual({ records: 98869, genomes: 40, uniqueKos: 3027, matchedKos: 168 });
  });
});
