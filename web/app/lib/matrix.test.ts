import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import databaseJson from '../data/genocap-db.json';
import { matrixToCsv } from './export';
import { parseAnnotations, splitKoCell } from './input';
import { buildMatrix } from './matrix';
import type { DatabaseEntry } from './types';

const database = databaseJson as DatabaseEntry[];

describe('matrix construction', () => {
  it('collects distinct functions for the corresponding gene and key gene context', () => {
    const base: DatabaseEntry = { metabolism: 'N', pathway: 'P', module: 'M', ko: 'K00001', geneName: 'g', geneFunction: 'reductase', isKey: true, sourceIndex: 0 };
    const db = [base, { ...base, ko: 'K00002' }, { ...base, geneFunction: 'transferase' }, { ...base, geneFunction: '' }, { ...base, module: 'Other', geneFunction: 'unrelated' }, { ...base, isKey: false, geneFunction: 'non-key function' }];
    expect(buildMatrix(db, [], ['A'], 'gene', true).rows[0].geneFunctions).toEqual(['reductase', 'transferase', 'non-key function']);
    expect(buildMatrix(db, [], ['A'], 'key', true).rows[0].geneFunctions).toEqual(['reductase', 'transferase']);
  });
  it('uses mode-specific suffixes, separates clusters, and omits NA rows', () => {
    const base: DatabaseEntry = { metabolism: 'N', pathway: 'P', module: 'Reduction', geneCluster: 'ab', ko: 'K00001', geneName: 'a', isKey: true, sourceIndex: 0 };
    const db = [base, { ...base, ko: 'K00002', geneName: 'b', sourceIndex: 1 }, { ...base, geneCluster: 'c', sourceIndex: 2 }, { ...base, geneCluster: '', geneName: '', sourceIndex: 3 }, { ...base, module: 'Skipped', ko: 'NA', sourceIndex: 4 }];
    const modules = buildMatrix(db, [], ['A'], 'module', true).rows;
    expect(modules.map((row) => row.feature)).toEqual(['Reduction (ab)', 'Reduction (c)', 'Reduction']);
    expect(modules[0].cells.A.total).toBe(2);
    expect(modules[1].cells.A.total).toBe(1);
    for (const mode of ['gene', 'key'] as const) {
      expect(buildMatrix(db, [], ['A'], mode, true).rows.map((row) => row.feature)).toEqual(['Reduction (a)', 'Reduction (b)', 'Reduction']);
    }
  });
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
    const matrix = buildMatrix(db, records, ['A'], 'module', true, 'solid');
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
    const matrix = buildMatrix(db, [], ['A'], 'module', true, 'quartile', new Set(['Sulfur']));
    expect(matrix.rows.map((row) => row.metabolism)).toEqual(['Sulfur']);
  });

  it('matches expected database contexts and sample visible rows', () => {
    const sample = readFileSync(resolve(process.cwd(), '../doc/input_annotation.tsv'), 'utf8');
    const parsed = parseAnnotations(sample, 'tsv', database);
    const geneRows = new Set<string>();
    const keyRows = new Set<string>();
    for (const entry of database) {
      if (!splitKoCell(entry.ko).kos.length) continue;
      const id = [entry.metabolism, entry.module, entry.geneName].join('\u001f');
      geneRows.add(id);
      if (entry.isKey) keyRows.add(id);
    }
    const moduleAll = buildMatrix(database, parsed.records, parsed.genomes, 'module', true);
    const moduleVisible = buildMatrix(database, parsed.records, parsed.genomes, 'module', false);
    const geneAll = buildMatrix(database, parsed.records, parsed.genomes, 'gene', true);
    const keyAll = buildMatrix(database, parsed.records, parsed.genomes, 'key', true);
    const visibleModuleRows = moduleAll.rows
      .filter((row) => parsed.genomes.some((genome) => row.cells[genome].hits > 0))
      .length;
    expect(geneAll.rows).toHaveLength(geneRows.size);
    expect(keyAll.rows).toHaveLength(keyRows.size);
    expect(moduleVisible.rows).toHaveLength(visibleModuleRows);
    expect(moduleAll.rows.length).toBeGreaterThanOrEqual(moduleVisible.rows.length);
  });

  it('exports current display values in genome order', () => {
    const matrix = buildMatrix(database.slice(0, 2), [{ gene: 'x', genome: 'A', kos: [database[0].ko], sourceLine: 2 }], ['A'], 'module', true);
    const csv = matrixToCsv(matrix, ['A']);
    expect(csv.split('\r\n')[0]).toBe('metabolism,pathway,module,feature,A');
    expect(csv).toContain(',1');
  });
});
