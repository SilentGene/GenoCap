'use client';

import { memo, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ClusterNode, MatrixModel, VisualizationSettings } from '../lib/types';

interface MatrixSvgProps {
  matrix: MatrixModel;
  genomeOrder: string[];
  clusterRoot?: ClusterNode;
  settings: VisualizationSettings;
  svgRef: RefObject<SVGSVGElement | null>;
}

interface HeaderProps {
  matrix: MatrixModel;
  genomeOrder: string[];
  clusterRoot?: ClusterNode;
  settings: VisualizationSettings;
}

const GROUP_WIDTH = 205;
const FEATURE_LABEL_GAP = 12;
const TREE_TOP = 18;
const TREE_HEIGHT = 88;
const TREE_LABEL_GAP = 14;
const LABEL_TOP_GAP = 8;
const LABEL_MATRIX_GAP = 10;
const BOTTOM_SPACE = 20;

function MatrixSvg({ matrix, genomeOrder, clusterRoot, settings, svgRef }: MatrixSvgProps) {
  const featureLabels = useMemo(() => matrix.rows.map((row) => row.feature), [matrix.rows]);
  const genomeLabelHeight = useTextWidth(genomeOrder, settings.fontSize);
  const featureLabelWidth = useTextWidth(featureLabels, settings.fontSize);
  const layout = getLayout(matrix, genomeOrder, settings, genomeLabelHeight, featureLabelWidth);
  const rotated = getRotatedCanvas(layout.width, layout.height, settings.rotation);
  const groups = metabolismGroups(matrix);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const activeTooltipRef = useRef('');
  const pinnedTooltipRef = useRef('');
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [tooltipPinned, setTooltipPinned] = useState(false);

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (pinnedTooltipRef.current) return;
    const target = (event.target as Element).closest<SVGElement>('[data-cell-tooltip], [data-feature-tooltip], [data-metabolism-tooltip]');
    if (!target) {
      if (activeTooltipRef.current) { activeTooltipRef.current = ''; setTooltip(null); }
      return;
    }
    const flip = event.clientY > window.innerHeight / 2;
    const placement = { x: event.clientX + 14, y: event.clientY + (flip ? -14 : 14), flip };
    let key = '';
    let nextTooltip: TooltipData | null = null;
    if (target.hasAttribute('data-cell-tooltip')) {
      const rowIndex = Number(target.dataset.rowIndex);
      const columnIndex = Number(target.dataset.columnIndex);
      const row = matrix.rows[rowIndex];
      const genome = genomeOrder[columnIndex];
      const cell = row?.cells[genome];
      if (!row || !genome || !cell) return;
      key = `cell-${rowIndex}-${columnIndex}`;
      nextTooltip = { kind: 'cell', genome, feature: row.feature, matchedGenes: cell.matchedGenes, hits: cell.hits, total: cell.total, ...placement };
    } else if (target.hasAttribute('data-feature-tooltip')) {
      const rowIndex = Number(target.dataset.rowIndex);
      const row = matrix.rows[rowIndex];
      if (!row) return;
      key = `feature-${rowIndex}`;
      nextTooltip = { kind: 'feature', feature: row.feature, module: row.module, pathway: row.pathway, ...placement };
    } else {
      key = `metabolism-${target.dataset.metabolismName}`;
      nextTooltip = { kind: 'metabolism', metabolism: target.dataset.metabolismName ?? '', featureCount: Number(target.dataset.featureCount), ...placement };
    }
    if (activeTooltipRef.current !== key) {
      activeTooltipRef.current = key;
      setTooltip(nextTooltip);
    } else if (tooltipRef.current) {
      tooltipRef.current.style.left = `${event.clientX + 14}px`;
      tooltipRef.current.style.top = `${event.clientY + (flip ? -14 : 14)}px`;
      tooltipRef.current.style.transform = flip ? 'translateY(-100%)' : 'none';
    }
  }

  function dismissTooltip() {
    activeTooltipRef.current = '';
    pinnedTooltipRef.current = '';
    setTooltipPinned(false);
    setTooltip(null);
  }

  function hideTooltip() {
    if (!pinnedTooltipRef.current) dismissTooltip();
  }

  function handleClick(event: ReactMouseEvent<SVGSVGElement>) {
    const target = (event.target as Element).closest<SVGElement>('[data-cell-tooltip]');
    if (!target) return;
    const rowIndex = Number(target.dataset.rowIndex);
    const columnIndex = Number(target.dataset.columnIndex);
    const row = matrix.rows[rowIndex];
    const genome = genomeOrder[columnIndex];
    const cell = row?.cells[genome];
    if (!row || !genome || !cell) return;
    const key = `cell-${rowIndex}-${columnIndex}`;
    if (pinnedTooltipRef.current === key) {
      dismissTooltip();
      return;
    }
    const flip = event.clientY > window.innerHeight / 2;
    pinnedTooltipRef.current = key;
    activeTooltipRef.current = key;
    setTooltipPinned(true);
    setTooltip({ kind: 'cell', genome, feature: row.feature, matchedGenes: cell.matchedGenes, hits: cell.hits, total: cell.total, x: event.clientX + 14, y: event.clientY + (flip ? -14 : 14), flip });
  }

  return (
    <><svg ref={svgRef} viewBox={`0 0 ${rotated.width} ${rotated.height}`} width={rotated.width * settings.zoom} height={rotated.height * settings.zoom} role="img" aria-label={`${matrix.mode} presence matrix with ${matrix.rows.length} features across ${genomeOrder.length} genomes, rotated ${settings.rotation} degrees`} className="block max-w-none bg-white" onPointerMove={handlePointerMove} onPointerLeave={hideTooltip} onClick={handleClick}>
      <desc>KEGG feature completeness grouped by metabolism across uploaded genomes.</desc>
      <g transform={rotated.transform}>
      <rect width={layout.width} height={layout.height} fill="#ffffff" />
      <g className={settings.rotation === 0 ? 'export-header' : undefined}><HeaderContent layout={layout} genomeOrder={genomeOrder} clusterRoot={clusterRoot} settings={settings} /></g>

      {groups.map((group) => {
        const y = layout.matrixTop + layout.rows[group.start].top;
        const last = layout.rows[group.end];
        const groupHeight = last.top + last.height - layout.rows[group.start].top;
        const color = settings.metabolismColors[group.name] ?? '#e8ebe7';
        const lines = wrapLabel(group.name, 24);
        return <g key={group.name}>
          {settings.metabolismColorTarget === 'background' ? <rect x={layout.matrixLeft} y={y + 1} width={layout.matrixWidth} height={Math.max(1, groupHeight - 2)} fill={color} /> : null}
          <g data-metabolism-tooltip="true" data-metabolism-name={group.name} data-feature-count={group.end - group.start + 1}>
            <WrappedText lines={lines} x={settings.swapSideLabels ? layout.matrixLeft - 14 : layout.matrixLeft + layout.matrixWidth + 14} centerY={y + groupHeight / 2} fontSize={Math.max(11, settings.fontSize + 1)} anchor={settings.swapSideLabels ? 'end' : 'start'} weight={650} color="#273630" />
          </g>
        </g>;
      })}

      {matrix.rows.map((row, rowIndex) => {
        const rowLayout = layout.rows[rowIndex];
        const cy = layout.matrixTop + rowLayout.center;
        return <g key={row.id}>
          <text x={settings.swapSideLabels ? layout.matrixLeft + layout.matrixWidth + FEATURE_LABEL_GAP : layout.matrixLeft - FEATURE_LABEL_GAP} y={cy} textAnchor={settings.swapSideLabels ? 'start' : 'end'} dominantBaseline="middle" fontSize={settings.fontSize} fill="#34433d" data-feature-tooltip="true" data-row-index={rowIndex}>{rowLayout.lines.map((line, lineIndex) => <tspan key={`${line}-${lineIndex}`} x={settings.swapSideLabels ? layout.matrixLeft + layout.matrixWidth + FEATURE_LABEL_GAP : layout.matrixLeft - FEATURE_LABEL_GAP} y={cy - ((rowLayout.lines.length - 1) * (settings.fontSize + 2)) / 2 + lineIndex * (settings.fontSize + 2)}>{line}</tspan>)}</text>
          {genomeOrder.map((genome, columnIndex) => {
            const cell = row.cells[genome];
            const cx = layout.matrixLeft + columnIndex * layout.pitch + layout.pitch / 2;
            return <Cell key={genome} cx={cx} cy={cy} size={settings.cellSize} value={cell.value} hits={cell.hits} total={cell.total} genome={genome} feature={row.feature} settings={settings} presentColor={settings.metabolismColorTarget === 'cell' ? settings.metabolismColors[row.metabolism] : undefined} rowIndex={rowIndex} columnIndex={columnIndex} />;
          })}
        </g>;
      })}
      </g>

    </svg>{tooltip && typeof document !== 'undefined' ? createPortal(<TooltipCard tooltip={tooltip} tooltipRef={tooltipRef} pinned={tooltipPinned} onClose={dismissTooltip} />, document.body) : null}</>
  );
}

interface TooltipPlacement { x: number; y: number; flip: boolean; }
type TooltipData =
  | ({ kind: 'cell'; genome: string; feature: string; matchedGenes: { geneId: string; geneName: string }[]; hits: number; total: number } & TooltipPlacement)
  | ({ kind: 'feature'; feature: string; module: string; pathway: string } & TooltipPlacement)
  | ({ kind: 'metabolism'; metabolism: string; featureCount: number } & TooltipPlacement);

function TooltipCard({ tooltip, tooltipRef, pinned, onClose }: { tooltip: TooltipData; tooltipRef: RefObject<HTMLDivElement | null>; pinned: boolean; onClose: () => void }) {
  return <div ref={tooltipRef} role="tooltip" className={`cell-tooltip fixed z-50 max-w-[480px] rounded-lg border border-[#cdd8d1] bg-[#fbfdf9] px-3.5 py-3 text-xs leading-5 text-[#263a33] shadow-[0_12px_36px_rgb(24_48_38/20%)] ${pinned ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ left: tooltip.x, top: tooltip.y, transform: tooltip.flip ? 'translateY(-100%)' : 'none' }}>
    {pinned ? <button type="button" className="tooltip-close" aria-label="Close pinned details" onClick={onClose}>×</button> : null}
    {tooltip.kind === 'cell' ? <><p><strong>Genome:</strong> {tooltip.genome}</p><p><strong>Feature:</strong> {tooltip.feature}</p><p className="mt-1 font-semibold">Present genes (gene ID — gene_name):</p>{tooltip.matchedGenes.length ? <div>{tooltip.matchedGenes.map(({ geneId, geneName }) => <p key={`${geneId}-${geneName}`}>{geneId} — {geneName}</p>)}</div> : <p>None</p>}<p className="mt-1"><strong>KO completeness:</strong> {tooltip.hits}/{tooltip.total}</p></> : tooltip.kind === 'feature' ? <><p><strong>Feature:</strong> {tooltip.feature}</p><p><strong>Module:</strong> {tooltip.module}</p><p><strong>Pathway:</strong> {tooltip.pathway || 'NA'}</p></> : <><p><strong>Metabolism:</strong> {tooltip.metabolism}</p><p><strong>Displayed features:</strong> {tooltip.featureCount}</p></>}
  </div>;
}

export function MatrixStickyHeader({ matrix, genomeOrder, clusterRoot, settings }: HeaderProps) {
  const featureLabels = useMemo(() => matrix.rows.map((row) => row.feature), [matrix.rows]);
  const genomeLabelHeight = useTextWidth(genomeOrder, settings.fontSize);
  const featureLabelWidth = useTextWidth(featureLabels, settings.fontSize);
  const layout = getLayout(matrix, genomeOrder, settings, genomeLabelHeight, featureLabelWidth);
  return <svg viewBox={`0 0 ${layout.width} ${layout.matrixTop}`} width={layout.width * settings.zoom} height={layout.matrixTop * settings.zoom} aria-hidden="true" className="block max-w-none bg-white"><rect width={layout.width} height={layout.matrixTop} fill="#ffffff" /><HeaderContent layout={layout} genomeOrder={genomeOrder} clusterRoot={clusterRoot} settings={settings} /></svg>;
}

interface Layout {
  pitch: number; treeHeight: number; matrixTop: number; matrixWidth: number; matrixHeight: number;
  matrixLeft: number; width: number; height: number; xForGenome: Map<string, number>;
  rows: { top: number; height: number; center: number; lines: string[] }[];
}

function getLayout(matrix: MatrixModel, genomeOrder: string[], settings: VisualizationSettings, labelHeight: number, measuredFeatureWidth: number): Layout {
  const pitch = settings.cellSize + settings.spacing;
  const treeHeight = settings.clustering ? TREE_HEIGHT : 0;
  const contentTop = settings.clustering ? TREE_TOP + treeHeight + TREE_LABEL_GAP : LABEL_TOP_GAP;
  const matrixTop = contentTop + labelHeight + LABEL_MATRIX_GAP;
  const matrixWidth = Math.max(1, genomeOrder.length * pitch);
  const featureLabelWidth = measuredFeatureWidth + FEATURE_LABEL_GAP * 2;
  let cursor = 0;
  const rows = matrix.rows.map((row) => {
    const lines = [row.feature];
    const height = pitch;
    const value = { top: cursor, height, center: cursor + height / 2, lines };
    cursor += height;
    return value;
  });
  const matrixHeight = Math.max(pitch, cursor);
  const matrixLeft = settings.swapSideLabels ? GROUP_WIDTH : featureLabelWidth;
  const width = featureLabelWidth + matrixWidth + GROUP_WIDTH;
  return { pitch, treeHeight, matrixTop, matrixWidth, matrixHeight, matrixLeft, width, height: matrixTop + matrixHeight + BOTTOM_SPACE, xForGenome: new Map(genomeOrder.map((genome, index) => [genome, matrixLeft + index * pitch + pitch / 2])), rows };
}

function useTextWidth(labels: string[], fontSize: number): number {
  const measurementKey = `${fontSize}:${labels.join('\u0000')}`;
  const fallback = Math.max(1, ...labels.map((label) => estimateTextWidth(label, fontSize)));
  const [measurement, setMeasurement] = useState<{ key: string; width: number } | null>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      const context = document.createElement('canvas').getContext('2d');
      if (!context || cancelled) return;
      context.font = `400 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
      const width = Math.max(1, ...labels.map((label) => Math.ceil(context.measureText(label).width)));
      setMeasurement({ key: measurementKey, width });
    };

    measure();
    void document.fonts?.ready.then(measure);
    return () => { cancelled = true; };
  }, [fontSize, labels, measurementKey]);

  return measurement?.key === measurementKey ? measurement.width : fallback;
}

function HeaderContent({ layout, genomeOrder, clusterRoot, settings }: { layout: Layout; genomeOrder: string[]; clusterRoot?: ClusterNode; settings: VisualizationSettings }) {
  const treeBottom = TREE_TOP + layout.treeHeight;
  const labelY = layout.matrixTop - LABEL_MATRIX_GAP;
  const dendrogram = settings.clustering && clusterRoot ? drawDendrogram(clusterRoot, layout.xForGenome, TREE_TOP, treeBottom) : [];
  const legendX = layout.matrixLeft + layout.matrixWidth + 22;
  const legendY = layout.matrixTop - 58;
  return <>{dendrogram}{settings.clustering && clusterRoot ? genomeOrder.map((genome) => { const x = layout.xForGenome.get(genome) ?? 0; const labelOuterY = labelY - estimateTextWidth(genome, settings.fontSize); return <line key={`leader-${genome}`} x1={x} y1={treeBottom} x2={x} y2={labelOuterY - 3} stroke="#6b7772" strokeWidth={1} strokeDasharray="3 3" />; }) : null}{genomeOrder.map((genome) => { const x = layout.xForGenome.get(genome) ?? 0; return <text key={genome} x={x} y={labelY} transform={`rotate(-90 ${x} ${labelY})`} textAnchor="start" fontSize={settings.fontSize} fill="#42514b">{genome}</text>; })}<g transform={`translate(${legendX}, ${legendY})`}><Cell cx={8} cy={0} size={15} value={0} hits={0} total={1} genome="" feature="" settings={settings} rowIndex={-1} columnIndex={0} /><text x={22} y={0} dominantBaseline="middle" fontSize={11} fill="#52615b">Absent</text><Cell cx={8} cy={28} size={15} value={1} hits={1} total={1} genome="" feature="" settings={settings} rowIndex={-1} columnIndex={1} /><text x={22} y={28} dominantBaseline="middle" fontSize={11} fill="#52615b">Present</text></g></>;
}

function estimateTextWidth(text: string, fontSize: number): number {
  // Genome names are mostly ASCII identifiers. A conservative em estimate keeps
  // even long names clear of both the dendrogram and the matrix during SSR/export.
  return Math.ceil(text.length * fontSize * 0.7);
}

function getRotatedCanvas(width: number, height: number, rotation: VisualizationSettings['rotation']): { width: number; height: number; transform?: string } {
  if (rotation === 90) return { width: height, height: width, transform: `translate(${height} 0) rotate(90)` };
  if (rotation === 180) return { width, height, transform: `translate(${width} ${height}) rotate(180)` };
  if (rotation === 270) return { width: height, height: width, transform: `translate(0 ${width}) rotate(270)` };
  return { width, height };
}

function WrappedText({ lines, x, centerY, fontSize, anchor, weight, color }: { lines: string[]; x: number; centerY: number; fontSize: number; anchor: 'start' | 'end'; weight: number; color: string }) {
  return <text x={x} y={centerY} textAnchor={anchor} dominantBaseline="middle" fontSize={fontSize} fontWeight={weight} fill={color}>{lines.map((line, index) => <tspan key={`${line}-${index}`} x={x} y={centerY - ((lines.length - 1) * (fontSize + 2)) / 2 + index * (fontSize + 2)}>{line}</tspan>)}</text>;
}

interface CellProps { cx: number; cy: number; size: number; value: number; hits: number; total: number; genome: string; feature: string; settings: VisualizationSettings; presentColor?: string; rowIndex: number; columnIndex: number; }

function Cell({ cx, cy, size, value, hits, total, genome, feature, settings, presentColor = settings.presentColor, rowIndex, columnIndex }: CellProps) {
  const radius = size / 2;
  const stroke = settings.border ? '#263a33' : 'none';
  const dataProps = genome ? { 'data-cell-tooltip': 'true', 'data-row-index': rowIndex, 'data-column-index': columnIndex, 'aria-label': `${feature}, ${genome}, ${hits} of ${total} KOs` } : {};
  if (settings.shape === 'square') return <g {...dataProps} className={genome ? 'matrix-cell' : undefined}><rect x={cx - radius} y={cy - radius} width={size} height={size} fill={settings.absentColor} />{value > 0 ? <rect x={cx - radius} y={cy + radius - size * value} width={size} height={size * value} fill={presentColor} /> : null}<rect x={cx - radius} y={cy - radius} width={size} height={size} fill="none" stroke={stroke} strokeWidth={1.2} /></g>;
  return <g {...dataProps} className={genome ? 'matrix-cell' : undefined}><circle cx={cx} cy={cy} r={radius} fill={settings.absentColor} />{value >= 1 ? <circle cx={cx} cy={cy} r={radius} fill={presentColor} /> : value > 0 ? <path d={sectorPath(cx, cy, radius, value)} fill={presentColor} /> : null}<circle cx={cx} cy={cy} r={radius} fill="none" stroke={stroke} strokeWidth={1.2} data-cell={`${rowIndex}-${columnIndex}`} /></g>;
}

function sectorPath(cx: number, cy: number, radius: number, fraction: number): string {
  const startAngle = -Math.PI / 2; const endAngle = startAngle + Math.PI * 2 * fraction;
  const startX = cx + radius * Math.cos(startAngle); const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle); const endY = cy + radius * Math.sin(endAngle);
  return `M ${cx} ${cy} L ${startX.toFixed(3)} ${startY.toFixed(3)} A ${radius} ${radius} 0 ${fraction > 0.5 ? 1 : 0} 1 ${endX.toFixed(3)} ${endY.toFixed(3)} Z`;
}

function wrapLabel(text: string, maxChars: number): string[] {
  const words = text.replaceAll('"', '').trim().split(/\s+/).flatMap((word) => word.length <= maxChars ? [word] : word.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [word]);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > maxChars) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.length ? lines : [''];
}

function metabolismGroups(matrix: MatrixModel): { name: string; start: number; end: number }[] {
  const groups: { name: string; start: number; end: number }[] = [];
  matrix.rows.forEach((row, index) => { const last = groups.at(-1); if (last?.name === row.metabolism) last.end = index; else groups.push({ name: row.metabolism, start: index, end: index }); });
  return groups;
}

function drawDendrogram(root: ClusterNode, positions: Map<string, number>, top: number, bottom: number): ReactElement[] {
  const lines: ReactElement[] = []; const maxHeight = root.height || 1;
  const walk = (node: ClusterNode): { x: number; y: number } => {
    if (node.genome) return { x: positions.get(node.genome) ?? 0, y: bottom };
    const left = walk(node.left!); const right = walk(node.right!); const x = (left.x + right.x) / 2; const y = bottom - (node.height / maxHeight) * (bottom - top);
    lines.push(<path key={`${node.id}-l`} d={`M ${left.x} ${left.y} V ${y} H ${x}`} fill="none" stroke="#43534c" strokeWidth={1.15} />);
    lines.push(<path key={`${node.id}-r`} d={`M ${right.x} ${right.y} V ${y} H ${x}`} fill="none" stroke="#43534c" strokeWidth={1.15} />);
    return { x, y };
  };
  walk(root); return lines;
}

export default memo(MatrixSvg);
