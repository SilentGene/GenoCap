import type { HeatmapColors, HeatmapScaling, MatrixCell, MatrixModel } from './types';

export function scaleHeatmapRows(matrix: MatrixModel): MatrixModel {
  return { ...matrix, rows: matrix.rows.map((row) => {
    const values = matrix.genomes.map((genome) => row.cells[genome].value);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    // Use the sample standard deviation, matching R's scale() convention.
    const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : 0;
    const deviation = Math.sqrt(variance);
    const zScoreUnavailable = values.length <= 1 ? 'single-genome' : deviation === 0 ? 'constant' : undefined;
    return { ...row, cells: Object.fromEntries(matrix.genomes.map((genome) => {
      const cell = row.cells[genome];
      return [genome, { ...cell, zScore: deviation > 0 ? (cell.value - mean) / deviation : 0, zScoreUnavailable }];
    })) };
  }) };
}

export function getHeatmapValue(cell: MatrixCell): number {
  return cell.zScore ?? cell.value;
}

export function getHeatmapRange(matrix: MatrixModel, scaling: HeatmapScaling = 'none'): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const row of matrix.rows) for (const genome of matrix.genomes) {
    const value = getHeatmapValue(row.cells[genome]);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (scaling === 'row-zscore') {
    // Keep zero centered, including when every row is constant.
    const extent = min === Infinity ? 1 : Math.max(Math.abs(min), Math.abs(max)) || 1;
    return { min: -extent, max: extent };
  }
  return min === Infinity ? { min: 0, max: 0 } : { min, max };
}

export function heatmapColor(value: number, min: number, max: number, colors: HeatmapColors): string {
  // A constant matrix uses the minimum color, with a single-value legend.
  const position = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  if (!colors.useMidpoint) return interpolate(colors.min, colors.max, position);
  return position <= 0.5
    ? interpolate(colors.min, colors.mid, position * 2)
    : interpolate(colors.mid, colors.max, (position - 0.5) * 2);
}

function interpolate(start: string, end: string, position: number): string {
  const channels = [1, 3, 5].map((offset) => {
    const from = parseInt(start.slice(offset, offset + 2), 16);
    const to = parseInt(end.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * position).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}
