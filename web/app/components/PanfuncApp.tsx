'use client';

import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  ColorPicker,
  ConfigProvider,
  Divider,
  Empty,
  Flex,
  List,
  Segmented,
  Select,
  Slider,
  Space,
  Statistic,
  Switch,
  Tag,
  Tooltip,
} from 'antd';
import { useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import databaseJson from '../data/panfunc-db.json';
import { clusterGenomes } from '../lib/cluster';
import { downloadPng, downloadSvg, downloadText, matrixToCsv } from '../lib/export';
import { parseAnnotations } from '../lib/input';
import { buildMatrix, DEFAULT_METABOLISM_COLORS, DEFAULT_METABOLISM_ORDER } from '../lib/matrix';
import type { DatabaseEntry, FigureRotation, FileKind, ParsedAnnotations, ViewMode, VisualizationSettings } from '../lib/types';
import MatrixSvg, { MatrixStickyHeader } from './MatrixSvg';

const database = databaseJson as DatabaseEntry[];
const metabolisms = [...new Set(database.map((entry) => entry.metabolism))];
const defaultMetabolismOrder = [
  ...DEFAULT_METABOLISM_ORDER.filter((metabolism) => metabolisms.includes(metabolism)),
  ...metabolisms.filter((metabolism) => !DEFAULT_METABOLISM_ORDER.includes(metabolism as typeof DEFAULT_METABOLISM_ORDER[number])),
];
const theme = {
  token: {
    colorPrimary: '#1677ff',
    colorInfo: '#1677ff',
    colorBgLayout: '#f5f5f5',
    colorText: '#1f1f1f',
    colorTextSecondary: '#595959',
    borderRadius: 8,
    fontFamily: 'var(--font-inter), Inter, Arial, sans-serif',
  },
  components: {
    Button: { controlHeight: 36 },
    Card: { headerBg: '#fafafa' },
    Segmented: { itemSelectedBg: '#ffffff' },
  },
};

const initialSettings: VisualizationSettings = {
  mode: 'module', shape: 'circle', spacing: 4, border: true, metabolismColorTarget: 'background', quarterFill: true, showAllRows: false,
  clustering: false, cellSize: 17, fontSize: 11, zoom: 1, rotation: 0, swapSideLabels: false,
  presentColor: '#636363', absentColor: '#ffffff', metabolismColors: { ...DEFAULT_METABOLISM_COLORS }, metabolismOrder: [...defaultMetabolismOrder],
  visibleMetabolisms: Object.fromEntries(metabolisms.map((metabolism) => [metabolism, true])),
};

export default function PanfuncApp() {
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  if (!mounted) return null;
  return <ConfigProvider theme={theme}><AntApp><PanfuncWorkspace /></AntApp></ConfigProvider>;
}

function PanfuncWorkspace() {
  const [fileKind, setFileKind] = useState<FileKind>('tsv');
  const [result, setResult] = useState<ParsedAnnotations | null>(null);
  const [fileName, setFileName] = useState('');
  const [usingExample, setUsingExample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState<VisualizationSettings>(initialSettings);
  const [draggingMetabolism, setDraggingMetabolism] = useState<string | null>(null);
  const draggedMetabolismRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const matrix = useMemo(() => {
    if (!result || result.errors.length) return null;
    const visible = new Set(Object.entries(settings.visibleMetabolisms).filter(([, isVisible]) => isVisible).map(([metabolism]) => metabolism));
    const nextMatrix = buildMatrix(database, result.records, result.genomes, settings.mode, settings.showAllRows, settings.quarterFill, visible);
    const ranks = new Map(settings.metabolismOrder.map((metabolism, index) => [metabolism, index]));
    return { ...nextMatrix, rows: nextMatrix.rows.toSorted((a, b) => (ranks.get(a.metabolism) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.metabolism) ?? Number.MAX_SAFE_INTEGER) || a.sourceIndex - b.sourceIndex) };
  }, [result, settings.mode, settings.showAllRows, settings.quarterFill, settings.visibleMetabolisms, settings.metabolismOrder]);

  const clustered = useMemo(() => {
    if (!matrix || !settings.clustering) return { order: matrix?.genomes ?? [], root: undefined };
    return clusterGenomes(matrix.genomes, matrix.rows);
  }, [matrix, settings.clustering]);

  const update = <K extends keyof VisualizationSettings>(key: K, value: VisualizationSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const rotateFigure = () => setSettings((current) => ({ ...current, rotation: ((current.rotation + 90) % 360) as FigureRotation }));
  const chooseFile = () => fileRef.current?.click();
  const changeFileKind = (kind: FileKind) => { setFileKind(kind); if (fileRef.current) fileRef.current.value = ''; };

  function reorderMetabolism(source: string, target: string) {
    if (source === target) return;
    setSettings((current) => {
      const nextOrder = [...current.metabolismOrder];
      const sourceIndex = nextOrder.indexOf(source);
      const targetIndex = nextOrder.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, source);
      return { ...current, metabolismOrder: nextOrder };
    });
  }

  function moveMetabolism(metabolism: string, direction: -1 | 1) {
    const index = settings.metabolismOrder.indexOf(metabolism);
    const target = settings.metabolismOrder[index + direction];
    if (target) reorderMetabolism(metabolism, target);
  }

  function beginMetabolismDrag(metabolism: string) {
    draggedMetabolismRef.current = metabolism;
    setDraggingMetabolism(metabolism);
  }

  function finishMetabolismDrag() {
    draggedMetabolismRef.current = null;
    setDraggingMetabolism(null);
  }

  async function loadAnnotations(name: string, readText: () => Promise<string>, isExample = false, kind: FileKind = fileKind) {
    setLoading(true); setCopied(false); setFileName(name); setUsingExample(isExample); setResult(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try { setResult(parseAnnotations(await readText(), kind, database)); }
    catch (error) {
      setResult({ records: [], genomes: [], summary: { records: 0, genomes: 0, uniqueKos: 0, matchedKos: 0 }, errors: [{ line: 1, field: 'file', value: '', reason: error instanceof Error ? error.message : 'Unable to read this file.' }] });
    } finally { setLoading(false); }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadAnnotations(file.name, () => file.text());
  }

  async function loadExampleFile() {
    if (fileRef.current) fileRef.current.value = '';
    setFileKind('tsv');
    await loadAnnotations('input_annotation.tsv', async () => {
      const response = await fetch('./input_annotation.tsv');
      if (!response.ok) throw new Error(`Unable to load the example file (${response.status}).`);
      return response.text();
    }, true, 'tsv');
  }

  async function copyErrors() {
    if (!result?.errors.length) return;
    const report = result.errors.map((error) => `Line ${error.line} [${error.field}]: ${error.reason}\nValue: ${error.value}`).join('\n\n');
    await navigator.clipboard.writeText(report);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }

  function exportCsv() {
    if (!matrix) return;
    downloadText(matrixToCsv(matrix, clustered.order), `genocap-${settings.mode}-matrix.csv`, 'text/csv;charset=utf-8');
  }

  async function exportPng() {
    if (!svgRef.current) return;
    setExporting(true);
    try { await downloadPng(svgRef.current, `genocap-${settings.mode}-matrix.png`); }
    finally { setExporting(false); }
  }

  const metabolismControls = <section className="metabolism-groups" aria-labelledby="metabolism-groups-heading">
      <Flex align="center" justify="space-between" gap={8} className="metabolism-groups-header">
        <h3 id="metabolism-groups-heading">Metabolism groups</h3>
        <Flex gap={4}>
          <Button type="link" size="small" onClick={() => update('visibleMetabolisms', Object.fromEntries(metabolisms.map((metabolism) => [metabolism, true])))}>Select all</Button>
          <Button type="link" size="small" onClick={() => update('visibleMetabolisms', Object.fromEntries(metabolisms.map((metabolism) => [metabolism, false])))}>Clear all</Button>
        </Flex>
      </Flex>
      <div className="metabolism-list">
        {settings.metabolismOrder.map((metabolism) => <MetabolismControl key={metabolism} metabolism={metabolism} checked={settings.visibleMetabolisms[metabolism] !== false} color={settings.metabolismColors[metabolism] ?? '#e8ebe7'} dragging={draggingMetabolism === metabolism} onDragStart={() => beginMetabolismDrag(metabolism)} onDragMove={(target) => { const source = draggedMetabolismRef.current; if (source) reorderMetabolism(source, target); }} onDragEnd={finishMetabolismDrag} onMove={(direction) => moveMetabolism(metabolism, direction)} onChecked={(checked) => setSettings((current) => ({ ...current, visibleMetabolisms: { ...current.visibleMetabolisms, [metabolism]: checked } }))} onColor={(value) => setSettings((current) => ({ ...current, metabolismColors: { ...current.metabolismColors, [metabolism]: value } }))} />)}
      </div>
    </section>;

  return <main className="panfunc-app">
    <div className="panfunc-layout">
      <aside className="panfunc-sidebar">
        <header className="panfunc-brand">
          <div className="brand-row">
            <img className="brand-mark" src="./favicon.svg" alt="" />
            <div className="brand-copy"><h1>GenoCap</h1><p>Explore Genome Capabilities</p></div>
            <a className="github-link" href="https://github.com/SilentGene/GenoCap" target="_blank" rel="noreferrer" aria-label="View GenoCap on GitHub" title="View source on GitHub">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.41-1.27.74-1.56-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.94 10.94 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.38-5.29 5.67.42.36.78 1.06.78 2.14v3.27c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" /></svg>
            </a>
          </div>
        </header>

        <input ref={fileRef} id="annotation-file" aria-label="Annotation file" type="file" accept={fileKind === 'tsv' ? '.tsv,text/tab-separated-values' : '.csv,text/csv'} onChange={handleFile} className="sr-only" />

        <div className="sidebar-stack">
          {result && !result.errors.length ? <Card size="small" title={<SectionTitle>Loaded dataset</SectionTitle>}>
            <p className="file-name" title={fileName}>{usingExample ? <a href="./input_annotation.tsv" download="input_annotation.tsv">{fileName}</a> : fileName}</p>
            <div className="statistics-grid">{[['Gene', result.summary.records], ['Genomes', result.summary.genomes], ['Unique KOs', result.summary.uniqueKos], ['DB matches', result.summary.matchedKos]].map(([label, value]) => <Statistic key={label} title={label} value={Number(value)} groupSeparator="," />)}</div>
            <Flex gap={8} className="file-actions mt-3">
              <Select className="file-kind-select" aria-label="Annotation file type" value={fileKind} options={[{ label: 'TSV', value: 'tsv' }, { label: 'CSV', value: 'csv' }]} onChange={(value) => changeFileKind(value as FileKind)} />
              <Button onClick={chooseFile} loading={loading}>Replace</Button>
            </Flex>
          </Card> : <Card size="small" title={<SectionTitle>Data source</SectionTitle>}>
            <h2 className="sidebar-heading">Import annotations</h2>
            <p className="helper-text">Select the file type first. Required headers are <code>gene</code>, <code>genome</code> and <code>ko</code>.</p>
            <Flex gap={8} className="file-actions mt-3">
              <Select className="file-kind-select" aria-label="Annotation file type" value={fileKind} options={[{ label: 'TSV', value: 'tsv' }, { label: 'CSV', value: 'csv' }]} onChange={(value) => changeFileKind(value as FileKind)} />
              <Button type="primary" onClick={chooseFile} loading={loading}>Choose annotation file</Button>
            </Flex>
            <a className="example-file-link" href="./input_annotation.tsv" aria-disabled={loading} onClick={(event) => { event.preventDefault(); if (!loading) void loadExampleFile(); }}>{loading ? 'Loading example...' : 'Use example file...'}</a>
            {fileName ? <p className="file-name mt-2" title={fileName}>{fileName}</p> : null}
          </Card>}

          <Card size="small" title={<SectionTitle>View mode</SectionTitle>}>
            <Segmented block value={settings.mode} options={[{ label: 'Module', value: 'module' }, { label: 'Gene', value: 'gene' }, { label: 'Key gene', value: 'key' }]} onChange={(value) => update('mode', value as ViewMode)} />
            <div className="settings-list">
              {settings.mode === 'module' ? <Toggle label="Use quartile fill" checked={settings.quarterFill} onChange={(checked) => update('quarterFill', checked)} /> : null}
              <Toggle label="Include unmatched features" checked={settings.showAllRows} onChange={(checked) => update('showAllRows', checked)} />
              <Toggle label="Cluster genomes" checked={settings.clustering} onChange={(checked) => update('clustering', checked)} />
            </div>
          </Card>

          <Card size="small" title={<SectionTitle>Appearance</SectionTitle>} extra={<Button type="link" size="small" onClick={() => setSettings(initialSettings)}>Reset</Button>}>
            <Field label="Cell shape"><Select value={settings.shape} onChange={(value) => update('shape', value)} options={[{ label: 'Circle', value: 'circle' }, { label: 'Square', value: 'square' }]} /></Field>
            <Field label="Metabolism colors"><Select value={settings.metabolismColorTarget} onChange={(value) => update('metabolismColorTarget', value)} options={[{ label: 'Background', value: 'background' }, { label: 'Cell fill', value: 'cell' }]} /></Field>
            <Range label="Cell size" value={settings.cellSize} min={10} max={28} suffix="px" onChange={(value) => update('cellSize', value)} />
            <Range label="Spacing" value={settings.spacing} min={0} max={12} suffix="px" onChange={(value) => update('spacing', value)} />
            <Range label="Label size" value={settings.fontSize} min={9} max={16} suffix="px" onChange={(value) => update('fontSize', value)} />
            <Toggle label="Cell borders" checked={settings.border} onChange={(checked) => update('border', checked)} />
            <Divider className="my-3" />
            <Flex gap={16} justify="space-between">{settings.metabolismColorTarget === 'background' ? <ColorInput label="Present" value={settings.presentColor} onChange={(value) => update('presentColor', value)} /> : null}<ColorInput label="Absent" value={settings.absentColor} onChange={(value) => update('absentColor', value)} /></Flex>
            {metabolismControls}
          </Card>
        </div>
      </aside>

      <section className="panfunc-workspace">
        {result?.errors.length ? <ErrorPanel fileName={fileName} result={result} copied={copied} onCopy={copyErrors} /> : null}
        <Card className="matrix-card" title={<div><SectionTitle>Functional matrix</SectionTitle><h2>{matrix ? `${modeTitle(settings.mode)} · ${matrix.rows.length.toLocaleString()} rows` : 'Genome feature landscape'}</h2></div>} extra={matrix ? <Flex wrap gap={8} align="center">
          <Tooltip title="Zoom out"><Button onClick={() => update('zoom', Math.max(0.5, +(settings.zoom - 0.1).toFixed(1)))} aria-label="Zoom out">−</Button></Tooltip>
          <Tag className="zoom-tag">{Math.round(settings.zoom * 100)}%</Tag>
          <Tooltip title="Zoom in"><Button onClick={() => update('zoom', Math.min(2, +(settings.zoom + 0.1).toFixed(1)))} aria-label="Zoom in">+</Button></Tooltip>
          <Button onClick={() => update('zoom', 1)}>Reset view</Button>
          <Divider orientation="vertical" className="toolbar-divider" />
          <Tooltip title={`Current rotation: ${settings.rotation}°`}><Button onClick={rotateFigure} aria-label="Rotate figure clockwise 90 degrees">Rotate 90°</Button></Tooltip>
          <Tooltip title="Exchange feature and metabolism labels between the two sides"><Button type={settings.swapSideLabels ? 'primary' : 'default'} onClick={() => update('swapSideLabels', !settings.swapSideLabels)} aria-pressed={settings.swapSideLabels}>Swap labels</Button></Tooltip>
          <Divider orientation="vertical" className="toolbar-divider" />
          <Button onClick={exportCsv}>CSV</Button>
          <Button onClick={() => svgRef.current && downloadSvg(svgRef.current, `genocap-${settings.mode}-matrix.svg`)}>SVG</Button>
          <Button onClick={exportPng} loading={exporting}>PNG</Button>
        </Flex> : null}>
          {!result ? <EmptyState fileKind={fileKind} /> : result.errors.length ? <BlockedState /> : matrix && matrix.rows.length ? <div className="matrix-scroll"><div className="relative min-w-max">{settings.rotation === 0 ? <div className="sticky top-0 z-10 h-px overflow-visible"><MatrixStickyHeader matrix={matrix} genomeOrder={clustered.order} clusterRoot={clustered.root} settings={settings} /></div> : null}<MatrixSvg matrix={matrix} genomeOrder={clustered.order} clusterRoot={clustered.root} settings={settings} svgRef={svgRef} /></div></div> : <NoFeatures showAll={settings.showAllRows} noMetabolismSelected={!Object.values(settings.visibleMetabolisms).some(Boolean)} />}
        </Card>
      </section>
    </div>
  </main>;
}

function SectionTitle({ children }: { children: ReactNode }) { return <span className="section-title">{children}</span>; }

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <Flex align="center" justify="space-between" gap={12} className="setting-row"><span>{label}</span><Switch size="small" checked={checked} onChange={onChange} /></Flex>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Range({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return <div className="range-field"><Flex justify="space-between"><span>{label}</span><code>{value}{suffix}</code></Flex><Slider min={min} max={max} value={value} onChange={onChange} tooltip={{ formatter: (next) => `${next}${suffix}` }} /></div>;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Flex align="center" gap={8}><span className="color-label">{label}</span><ColorPicker value={value} format="hex" onChangeComplete={(color) => onChange(color.toHexString())} aria-label={`${label} color`} /></Flex>;
}

function MetabolismControl({ metabolism, checked, color, dragging, onDragStart, onDragMove, onDragEnd, onMove, onChecked, onColor }: { metabolism: string; checked: boolean; color: string; dragging: boolean; onDragStart: () => void; onDragMove: (target: string) => void; onDragEnd: () => void; onMove: (direction: -1 | 1) => void; onChecked: (checked: boolean) => void; onColor: (color: string) => void }) {
  function movePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-metabolism]')?.dataset.metabolism;
    if (target) onDragMove(target);
  }

  function releasePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onDragEnd();
  }

  return <Flex align="center" gap={6} className={`metabolism-row${dragging ? ' is-dragging' : ''}`} data-metabolism={metabolism}>
    <button type="button" className="metabolism-drag-handle" aria-label={`Reorder ${metabolism}`} title="Drag to reorder" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onDragStart(); }} onPointerMove={movePointer} onPointerUp={releasePointer} onPointerCancel={releasePointer} onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); onMove(event.key === 'ArrowUp' ? -1 : 1); } }}>
      <svg viewBox="0 0 12 18" aria-hidden="true">{[3, 9].flatMap((x) => [4, 9, 14].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" fill="currentColor" />))}</svg>
    </button>
    <Checkbox checked={checked} onChange={(event) => onChecked(event.target.checked)}>{metabolism}</Checkbox>
    <ColorPicker size="small" value={color} format="hex" disabled={!checked} onChangeComplete={(next) => onColor(next.toHexString())} aria-label={`${metabolism} color`} />
  </Flex>;
}

function ErrorPanel({ fileName, result, copied, onCopy }: { fileName: string; result: ParsedAnnotations; copied: boolean; onCopy: () => void }) {
  return <Alert className="error-panel" type="error" showIcon message={`We found ${result.errors.length.toLocaleString()} formatting ${result.errors.length === 1 ? 'issue' : 'issues'} in ${fileName}`} description={<><p>Analysis is paused. Correct every listed row and upload the file again.</p><Button danger size="small" onClick={onCopy}>{copied ? 'Copied' : 'Copy error list'}</Button><List size="small" className="error-list" dataSource={result.errors} renderItem={(error) => <List.Item><Flex gap={12} align="flex-start"><Tag color="error">Line {error.line}</Tag><div><strong>{error.field}</strong><p>{error.reason}</p>{error.value ? <code>{error.value}</code> : null}</div></Flex></List.Item>} /></>} />;
}

function EmptyState({ fileKind }: { fileKind: FileKind }) {
  return <div className="empty-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<div><h2>Bring your KEGG annotations into view</h2><p>Upload a {fileKind.toUpperCase()} file to compare modules, genes and key metabolic features across every genome—without sending data anywhere.</p><Space wrap><Tag>LF + CRLF</Tag><Tag>Multiple KOs</Tag><Tag>SVG · PNG · CSV</Tag></Space></div>} /></div>;
}

function BlockedState() { return <div className="empty-state"><Empty description={<div><h2>Visualization paused</h2><p>Resolve the file issues listed above, then upload it again.</p></div>} /></div>; }
function NoFeatures({ showAll, noMetabolismSelected }: { showAll: boolean; noMetabolismSelected: boolean }) { return <div className="empty-state"><Empty description={<div><h2>No features to display</h2><p>{noMetabolismSelected ? 'Select at least one metabolism group in Appearance.' : showAll ? 'The selected database view contains no evaluable rows.' : 'No uploaded KO matched this view. Try including unmatched features, or choose another mode.'}</p></div>} /></div>; }
function modeTitle(mode: ViewMode) { return mode === 'module' ? 'Module completeness' : mode === 'gene' ? 'Gene presence' : 'Key gene presence'; }
