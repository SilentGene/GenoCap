import { describe, expect, it } from 'vitest';
import { getHeatmapRange, getHeatmapValue, heatmapColor, scaleHeatmapRows } from './heatmap';
import { buildMatrix } from './matrix';
import { matrixToCsv } from './export';
import type { DatabaseEntry, HeatmapColors, MatrixModel } from './types';

const colors: HeatmapColors = { min: '#0000FF', mid: '#FFFFFF', max: '#FF0000', useMidpoint: true };

function countMatrix(values: number[][]): MatrixModel {
  const genomes = (values[0] ?? []).map((_, index) => `G${index}`);
  return { mode: 'gene', genomes, rows: values.map((counts, index) => ({
    id: String(index), metabolism: 'M', pathway: 'P', module: 'X', feature: `g${index}`, kos: [], sourceIndex: index,
    cells: Object.fromEntries(genomes.map((genome, column) => [genome, { value: counts[column], rawValue: Number(counts[column] > 0), hits: Number(counts[column] > 0), total: 1, matchedGenes: [] }])),
  })) };
}

describe('row z-score scaling', () => {
  it('standardizes each row independently using sample standard deviation and preserves counts', () => {
    const matrix = countMatrix([[1, 3, 5], [10, 30, 50]]);
    const scaled = scaleHeatmapRows(matrix);
    for (const row of scaled.rows) {
      expect(Object.values(row.cells).map(getHeatmapValue)).toEqual([-1, 0, 1]);
    }
    expect(Object.values(scaled.rows[0].cells).map((cell) => cell.value)).toEqual([1, 3, 5]);
    expect(matrix.rows[0].cells.G0.zScore).toBeUndefined();
    expect(matrixToCsv(scaled, scaled.genomes)).toContain(',-1,0,1');
    expect(matrixToCsv(matrix, matrix.genomes)).toContain(',1,3,5');
  });

  it('uses a symmetric range for asymmetric scores and maps zero to the midpoint color', () => {
    const scaled = scaleHeatmapRows(countMatrix([[0, 0, 3], [1, 1, 1]]));
    const range = getHeatmapRange(scaled, 'row-zscore');
    expect(range.max).toBeCloseTo(2 / Math.sqrt(3));
    expect(range.min).toBe(-range.max);
    expect(scaled.rows[0].cells.G0.zScore).toBeCloseTo(-1 / Math.sqrt(3));
    expect(heatmapColor(0, range.min, range.max, colors)).toBe('#ffffff');
    expect(heatmapColor(0, range.min, range.max, { ...colors, useMidpoint: false })).toBe('#800080');
    const filtered = scaleHeatmapRows({ ...scaled, rows: [scaled.rows[0]] });
    expect(filtered.rows[0].cells.G0.zScore).toBe(scaled.rows[0].cells.G0.zScore);
  });

  it('displays constant rows and single genomes as neutral zero with an explicit reason', () => {
    const constant = scaleHeatmapRows(countMatrix([[0, 0, 0], [5, 5, 5]]));
    for (const row of constant.rows) for (const cell of Object.values(row.cells)) {
      expect(cell.zScore).toBe(0);
      expect(cell.zScoreUnavailable).toBe('constant');
    }
    expect(getHeatmapRange(constant, 'row-zscore')).toEqual({ min: -1, max: 1 });
    const single = scaleHeatmapRows(countMatrix([[7]]));
    expect(single.rows[0].cells.G0).toMatchObject({ value: 7, zScore: 0, zScoreUnavailable: 'single-genome' });
    expect(getHeatmapRange(scaleHeatmapRows(countMatrix([])), 'row-zscore')).toEqual({ min: -1, max: 1 });
  });
});

describe('heatmap colors', () => {
  it('interpolates through the minimum, midpoint and maximum', () => {
    expect([0, 1, 2, 3, 4].map((value) => heatmapColor(value, 0, 4, colors)))
      .toEqual(['#0000ff', '#8080ff', '#ffffff', '#ff8080', '#ff0000']);
  });

  it('supports two-color gradients and customized endpoints', () => {
    expect(heatmapColor(2, 0, 4, { ...colors, useMidpoint: false })).toBe('#800080');
    expect(heatmapColor(15, 10, 20, { min: '#000000', mid: '#00FF00', max: '#FFFFFF', useMidpoint: true })).toBe('#00ff00');
    expect(heatmapColor(15, 10, 20, { ...colors, min: '#000000', max: '#FFFFFF', useMidpoint: false })).toBe('#808080');
  });

  it('handles constant ranges, empty matrices, and out-of-range values', () => {
    expect(heatmapColor(0, 0, 0, colors)).toBe('#0000ff');
    expect(heatmapColor(3, 3, 3, colors)).toBe('#0000ff');
    expect(heatmapColor(-1, 0, 4, colors)).toBe('#0000ff');
    expect(heatmapColor(9, 0, 4, colors)).toBe('#ff0000');
    expect(getHeatmapRange({ mode: 'gene', rows: [], genomes: [] })).toEqual({ min: 0, max: 0 });
  });
});

describe('gene abundance', () => {
  const db: DatabaseEntry[] = [{ metabolism: 'M', pathway: 'P', module: 'X', ko: 'K00001,K00002', geneName: 'g', isKey: true, sourceIndex: 0 }];
  const records = [
    { gene: 'g1', genome: 'A', kos: ['K00001', 'K00002'], geneAbundance: 2.5, sourceLine: 2 },
    { gene: 'g1', genome: 'A', kos: ['K00001'], geneAbundance: 2.5, sourceLine: 3 },
    { gene: 'g2', genome: 'A', kos: ['K00002'], geneAbundance: 4, sourceLine: 4 },
    { gene: 'g1', genome: 'B', kos: ['K00001'], geneAbundance: 0.5, sourceLine: 5 },
  ];

  it.each(['gene', 'key'] as const)('sums abundance of unique genes in %s mode, including zero, and exports abundance', (mode) => {
    const matrix = buildMatrix(db, records, ['A', 'B', 'C'], mode, true, 'heatmap');
    expect(Object.values(matrix.rows[0].cells).map((cell) => cell.value)).toEqual([6.5, 0.5, 0]);
    expect(getHeatmapRange(matrix)).toEqual({ min: 0, max: 6.5 });
    expect(matrixToCsv(matrix, matrix.genomes)).toContain(',6.5,0.5,0');
    const solid = buildMatrix(db, records, ['A', 'B', 'C'], mode, true, 'solid');
    expect(Object.values(solid.rows[0].cells).map((cell) => cell.value)).toEqual([1, 1, 0]);
  });
});

it('keeps module values independent of abundance', () => {
 const db: DatabaseEntry[] = [{ metabolism: 'M', pathway: 'P', module: 'X', ko: 'K00001', geneName: 'g', isKey: true, sourceIndex: 0 }];
 const records = [{ gene: 'g', genome: 'A', kos: ['K00001'], sourceLine: 2, geneAbundance: 0 }];
 expect(buildMatrix(db, records, ['A'], 'module', false, 'quartile').rows[0].cells.A.value).toBe(1);
 expect(buildMatrix(db, records, ['A'], 'gene', false, 'heatmap').rows[0].cells.A.value).toBe(0);
});
