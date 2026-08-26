import type { MatrixModel } from './types';

export function matrixToCsv(matrix: MatrixModel, genomeOrder: string[]): string {
  const header = ['metabolism', 'pathway', 'module', 'feature', ...genomeOrder];
  const rows = matrix.rows.map((row) => [
    row.metabolism, row.pathway, row.module, row.feature,
    ...genomeOrder.map((genome) => String(row.cells[genome].value)),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadText(content: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type });
  downloadBlob(blob, filename);
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const serialized = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}

export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  downloadText(serializeSvg(svg), filename, 'image/svg+xml;charset=utf-8');
}

export async function downloadPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const source = serializeSvg(svg);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Unable to render SVG.')); image.src = url; });
    const viewBox = svg.viewBox.baseVal;
    const width = Math.max(1, viewBox.width || svg.width.baseVal.value);
    const height = Math.max(1, viewBox.height || svg.height.baseVal.value);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale); context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG export failed.')), 'image/png'));
    downloadBlob(png, filename);
  } finally { URL.revokeObjectURL(url); }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
