import { describe, expect, it } from 'vitest';
import { clusterGenomes, weightedJaccard } from './cluster';
import type { FeatureRow } from './types';

function row(id: string, values: Record<string, number>): FeatureRow {
  return { id, metabolism: 'M', pathway: 'P', module: 'X', feature: id, kos: [], sourceIndex: 0, cells: Object.fromEntries(Object.entries(values).map(([genome, value]) => [genome, { value, rawValue: value, hits: value ? 1 : 0, total: 1, matchedGenes: [] }])) };
}

describe('genome clustering', () => {
  it('calculates weighted Jaccard distance', () => {
    expect(weightedJaccard([1, 0.5, 0], [1, 0, 1])).toBeCloseTo(0.6);
    expect(weightedJaccard([0, 0], [0, 0])).toBe(0);
  });

  it('clusters similar genomes together with stable leaf ordering', () => {
    const genomes = ['A', 'B', 'C'];
    const rows = [row('one', { A: 1, B: 1, C: 0 }), row('two', { A: 1, B: 0.75, C: 0 })];
    const result = clusterGenomes(genomes, rows);
    expect(result.order.slice(0, 2)).toEqual(['A', 'B']);
    expect(result.root?.members).toHaveLength(3);
  });

  it('handles a single genome', () => {
    expect(clusterGenomes(['A'], []).order).toEqual(['A']);
  });
});
