'use client';

import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
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
import { useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react';
import databaseJson from '../data/panfunc-db.json';
import { clusterGenomes } from '../lib/cluster';
import { downloadPng, downloadSvg, downloadText, matrixToCsv } from '../lib/export';
import { parseAnnotations } from '../lib/input';
import { buildMatrix, DEFAULT_METABOLISM_COLORS } from '../lib/matrix';
import type { DatabaseEntry, FileKind, ParsedAnnotations, ViewMode, VisualizationSettings } from '../lib/types';
import MatrixSvg, { MatrixStickyHeader } from './MatrixSvg';

const database = databaseJson as DatabaseEntry[];
const metabolisms = [...new Set(database.map((entry) => entry.metabolism))];
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
  mode: 'module', shape: 'circle', spacing: 4, border: true, backgroundCoverage: 'full', quarterFill: true, showAllRows: false,
  clustering: false, cellSize: 17, fontSize: 11, zoom: 1,
  presentColor: '#636363', absentColor: '#ffffff', metabolismColors: { ...DEFAULT_METABOLISM_COLORS },
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
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState<VisualizationSettings>(initialSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const matrix = useMemo(() => {
    if (!result || result.errors.length) return null;
    const visible = new Set(Object.entries(settings.visibleMetabolisms).filter(([, isVisible]) => isVisible).map(([metabolism]) => metabolism));
    return buildMatrix(database, result.records, result.genomes, settings.mode, settings.showAllRows, settings.quarterFill, visible);
  }, [result, settings.mode, settings.showAllRows, settings.quarterFill, settings.visibleMetabolisms]);

  const clustered = useMemo(() => {
    if (!matrix || !settings.clustering) return { order: matrix?.genomes ?? [], root: undefined };
    return clusterGenomes(matrix.genomes, matrix.rows);
  }, [matrix, settings.clustering]);

  const update = <K extends keyof VisualizationSettings>(key: K, value: VisualizationSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const chooseFile = () => fileRef.current?.click();
  const changeFileKind = (kind: FileKind) => { setFileKind(kind); if (fileRef.current) fileRef.current.value = ''; };

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true); setCopied(false); setFileName(file.name); setResult(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try { setResult(parseAnnotations(await file.text(), fileKind, database)); }
    catch (error) {
      setResult({ records: [], genomes: [], summary: { records: 0, genomes: 0, uniqueKos: 0, matchedKos: 0 }, errors: [{ line: 1, field: 'file', value: '', reason: error instanceof Error ? error.message : 'Unable to read this file.' }] });
    } finally { setLoading(false); }
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

  const metabolismItems = [{
    key: 'metabolisms',
    label: 'Metabolism groups',
    children: <div>
      <Flex justify="flex-end" gap={4} className="mb-2">
        <Button type="link" size="small" onClick={() => update('visibleMetabolisms', Object.fromEntries(metabolisms.map((metabolism) => [metabolism, true])))}>Select all</Button>
        <Button type="link" size="small" onClick={() => update('visibleMetabolisms', Object.fromEntries(metabolisms.map((metabolism) => [metabolism, false])))}>Clear all</Button>
      </Flex>
      <Space orientation="vertical" size={10} className="w-full">
        {metabolisms.map((metabolism) => <MetabolismControl key={metabolism} metabolism={metabolism} checked={settings.visibleMetabolisms[metabolism] !== false} color={settings.metabolismColors[metabolism] ?? '#e8ebe7'} onChecked={(checked) => setSettings((current) => ({ ...current, visibleMetabolisms: { ...current.visibleMetabolisms, [metabolism]: checked } }))} onColor={(value) => setSettings((current) => ({ ...current, metabolismColors: { ...current.metabolismColors, [metabolism]: value } }))} />)}
      </Space>
    </div>,
  }];

  return <main className="panfunc-app">
    <div className="panfunc-layout">
      <aside className="panfunc-sidebar">
        <header className="panfunc-brand">
          <div className="brand-row"><div className="brand-mark">G</div><div><h1>GenoCap</h1><p>Explore Genome Capabilities</p></div></div>
          <div className="privacy-row"><Badge status="success" /><span>Local processing · private by design</span><a href="https://github.com/SilentGene/GenoCap" target="_blank" rel="noreferrer">Source</a></div>
        </header>

        <input ref={fileRef} id="annotation-file" aria-label="Annotation file" type="file" accept={fileKind === 'tsv' ? '.tsv,text/tab-separated-values' : '.csv,text/csv'} onChange={handleFile} className="sr-only" />

        <div className="sidebar-stack">
          {result && !result.errors.length ? <Card size="small" title={<SectionTitle>Loaded dataset</SectionTitle>}>
            <p className="file-name" title={fileName}>{fileName}</p>
            <div className="statistics-grid">{[['Records', result.summary.records], ['Genomes', result.summary.genomes], ['Unique KOs', result.summary.uniqueKos], ['DB matches', result.summary.matchedKos]].map(([label, value]) => <Statistic key={label} title={label} value={Number(value)} groupSeparator="," />)}</div>
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
            <Field label="Background coverage"><Select value={settings.backgroundCoverage} onChange={(value) => update('backgroundCoverage', value)} options={[{ label: 'Full row', value: 'full' }, { label: 'Cell area only', value: 'matrix' }]} /></Field>
            <Range label="Cell size" value={settings.cellSize} min={10} max={28} suffix="px" onChange={(value) => update('cellSize', value)} />
            <Range label="Spacing" value={settings.spacing} min={0} max={12} suffix="px" onChange={(value) => update('spacing', value)} />
            <Range label="Label size" value={settings.fontSize} min={9} max={16} suffix="px" onChange={(value) => update('fontSize', value)} />
            <Toggle label="Cell borders" checked={settings.border} onChange={(checked) => update('border', checked)} />
            <Divider className="my-3" />
            <Flex gap={16} justify="space-between"><ColorInput label="Present" value={settings.presentColor} onChange={(value) => update('presentColor', value)} /><ColorInput label="Absent" value={settings.absentColor} onChange={(value) => update('absentColor', value)} /></Flex>
            <Collapse className="mt-3" size="small" items={metabolismItems} />
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
          <Button onClick={exportCsv}>CSV</Button>
          <Button onClick={() => svgRef.current && downloadSvg(svgRef.current, `genocap-${settings.mode}-matrix.svg`)}>SVG</Button>
          <Button onClick={exportPng} loading={exporting}>PNG</Button>
        </Flex> : null}>
          {!result ? <EmptyState fileKind={fileKind} /> : result.errors.length ? <BlockedState /> : matrix && matrix.rows.length ? <div className="matrix-scroll"><div className="relative min-w-max"><div className="sticky top-0 z-10 h-px overflow-visible"><MatrixStickyHeader matrix={matrix} genomeOrder={clustered.order} clusterRoot={clustered.root} settings={settings} /></div><MatrixSvg matrix={matrix} genomeOrder={clustered.order} clusterRoot={clustered.root} settings={settings} svgRef={svgRef} /></div></div> : <NoFeatures showAll={settings.showAllRows} noMetabolismSelected={!Object.values(settings.visibleMetabolisms).some(Boolean)} />}
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

function MetabolismControl({ metabolism, checked, color, onChecked, onColor }: { metabolism: string; checked: boolean; color: string; onChecked: (checked: boolean) => void; onColor: (color: string) => void }) {
  return <Flex align="center" justify="space-between" gap={8} className="metabolism-row"><Checkbox checked={checked} onChange={(event) => onChecked(event.target.checked)}>{metabolism}</Checkbox><ColorPicker size="small" value={color} format="hex" disabled={!checked} onChangeComplete={(next) => onColor(next.toHexString())} aria-label={`${metabolism} background color`} /></Flex>;
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
