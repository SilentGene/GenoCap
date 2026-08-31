import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import databaseJson from '../data/genocap-db.json';
import { matrixToCsv } from './export';
import { parseAnnotations } from './input';
import { buildMatrix } from './matrix';
import type { DatabaseEntry } from './types';

const database = databaseJson as DatabaseEntry[];

describe('matrix construction', () => {
  it('rounds module completeness to the nearest quarter', () => {
    const db: DatabaseEntry[] = ['K00001', 'K00002', 'K00003'].map((ko, sourceIndex) => ({ metabolism: 'M', pathway: 'P', module: 'Three genes', ko, geneName: `g${sourceIndex}`, isKey: false, sourceIndex }));
    const records = [{ gene: 'x', genome: 'A', kos: ['K00001'], sourceLine: 2 }];
    const matrix = buildMatrix(db, records, ['A'], 'module', true);
    expect(matrix.rows[0].cells.A.rawValue).toBeCloseTo(1 / 3);
    expect(matrix.rows[0].cells.A.value).toBe(0.25);
  });

  it('fills the complete module symbol when quartile fill is disabled', () => {
    const db: DatabaseEntry[] = ['K00001', 'K00002', 'K00003'].map((ko, sourceIndex) => ({ metabolism: 'M', pathway: 'P', module: 'Three genes', ko, geneName: `g${sourceIndex}`, isKey: false, sourceIndex }));
    const records = [{ gene: 'x', genome: 'A', kos: ['K00001'], sourceLine: 2 }];
    const matrix = buildMatrix(db, records, ['A'], 'module', true, false);
    expect(matrix.rows[0].cells.A.rawValue).toBeCloseTo(1 / 3);
    expect(matrix.rows[0].cells.A.value).toBe(1);
  });

  it('keeps same-named genes separate by functional context', () => {
    const entries = database.filter((entry) => entry.geneName === 'ack');
    const matrix = buildMatrix(entries, [], ['A'], 'gene', true);
    expect(matrix.rows).toHaveLength(2);
    expect(new Set(matrix.rows.map((row) => row.metabolism)).size).toBe(2);
  });

  it('maps present input gene IDs to database gene names for tooltips', () => {
    const db: DatabaseEntry[] = [{ metabolism: 'M', pathway: 'P', module: 'Nitrate reduction', ko: 'K00370', geneName: 'narG', isKey: true, sourceIndex: 0 }];
    const records = [{ gene: 'contig_12_gene_4', genome: 'A', kos: ['K00370'], sourceLine: 2 }];
    const matrix = buildMatrix(db, records, ['A'], 'module', true);
    expect(matrix.rows[0].cells.A.matchedGenes).toEqual([{ geneId: 'contig_12_gene_4', ko: 'K00370', geneName: 'narG' }]);
  });

  it('treats multiple KOs in one database cell as alternatives and reports the matched KO', () => {
    const db: DatabaseEntry[] = [
      { metabolism: 'M', pathway: 'P', module: 'Chitin degrading', ko: 'K01183, K13381', geneName: 'chitinase', isKey: true, sourceIndex: 0 },
      { metabolism: 'M', pathway: 'P', module: 'Chitin degrading', ko: 'K00001', geneName: 'helper', isKey: true, sourceIndex: 1 },
    ];
    const records = [
      { gene: 'gene_chitinase', genome: 'A', kos: ['K01183'], sourceLine: 2 },
      { gene: 'gene_helper', genome: 'A', kos: ['K00001'], sourceLine: 3 },
    ];
    const cell = buildMatrix(db, records, ['A'], 'module', true).rows[0].cells.A;
    expect(cell).toMatchObject({ hits: 2, total: 2, rawValue: 1, value: 1 });
    expect(cell.matchedGenes).toEqual([
      { geneId: 'gene_chitinase', ko: 'K01183', geneName: 'chitinase' },
      { geneId: 'gene_helper', ko: 'K00001', geneName: 'helper' },
    ]);
  });

  it('omits unchecked metabolism groups from the matrix', () => {
    const db: DatabaseEntry[] = [
      { metabolism: 'Nitrogen', pathway: 'P', module: 'N module', ko: 'K00001', geneName: 'n', isKey: false, sourceIndex: 0 },
      { metabolism: 'Sulfur', pathway: 'P', module: 'S module', ko: 'K00002', geneName: 's', isKey: false, sourceIndex: 1 },
    ];
    const matrix = buildMatrix(db, [], ['A'], 'module', true, true, new Set(['Sulfur']));
    expect(matrix.rows.map((row) => row.metabolism)).toEqual(['Sulfur']);
  });

  it('matches expected database contexts and sample visible rows', () => {
    const sample = readFileSync(resolve(process.cwd(), '../doc/input_annotation.tsv'), 'utf8');
    const parsed = parseAnnotations(sample, 'tsv', database);
    const rowCounts = [
      buildMatrix(database, parsed.records, parsed.genomes, 'module', true).rows.length,
      buildMatrix(database, parsed.records, parsed.genomes, 'gene', true).rows.length,
      buildMatrix(database, parsed.records, parsed.genomes, 'key', true).rows.length,
      buildMatrix(database, parsed.records, parsed.genomes, 'module', false).rows.length,
    ];
    expect(rowCounts).toEqual([171, 391, 144, 104]);
  });

  it('exports current display values in genome order', () => {
    const matrix = buildMatrix(database.slice(0, 2), [{ gene: 'x', genome: 'A', kos: [database[0].ko], sourceLine: 2 }], ['A'], 'module', true);
    const csv = matrixToCsv(matrix, ['A']);
    expect(csv.split('\r\n')[0]).toBe('metabolism,pathway,module,feature,A');
    expect(csv).toContain(',1');
  });
});
