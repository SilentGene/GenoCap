export type FileKind = 'tsv' | 'csv';
export type ViewMode = 'module' | 'gene' | 'key';
export type CellShape = 'circle' | 'square';
export type FillStyle = 'solid' | 'quartile' | 'heatmap';
export type HeatmapScaling = 'none' | 'row-zscore';
export interface HeatmapColors {
  min: string;
  mid: string;
  max: string;
  useMidpoint: boolean;
}
export type MetabolismColorTarget = 'background' | 'cell' | 'strip';
export type FigureRotation = 0 | 90 | 180 | 270;

export interface AnnotationRecord {
  gene: string;
  genome: string;
  kos: string[];
  sourceLine: number;
  geneAbundance?: number;
}

export interface InputValidationError {
  line: number;
  field: 'file' | 'header' | 'row' | 'gene' | 'genome' | 'ko' | 'gene_abundance';
  value: string;
  reason: string;
}

export interface ParseSummary {
  records: number;
  genomes: number;
  uniqueKos: number;
  matchedKos: number;
}

export interface ParsedAnnotations {
  hasGeneAbundance?: boolean;
  records: AnnotationRecord[];
  genomes: string[];
  errors: InputValidationError[];
  summary: ParseSummary;
}

export interface DatabaseEntry {
  metabolism: string;
  pathway: string;
  module: string;
  geneCluster?: string;
  geneFunction?: string;
  ko: string;
  geneName: string;
  isKey: boolean;
  sourceIndex: number;
}

export interface MatrixCell {
  value: number;
  zScore?: number;
  zScoreUnavailable?: 'constant' | 'single-genome';
  rawValue: number;
  hits: number;
  total: number;
  matchedGenes: { geneId: string; ko: string; geneName: string }[];
}

export interface FeatureRow {
  geneFunctions?: string[];
  id: string;
  metabolism: string;
  pathway: string;
  module: string;
  feature: string;
  kos: string[];
  sourceIndex: number;
  cells: Record<string, MatrixCell>;
}

export interface MatrixModel {
  mode: ViewMode;
  genomes: string[];
  rows: FeatureRow[];
}

export interface ClusterNode {
  id: string;
  height: number;
  members: number[];
  genome?: string;
  left?: ClusterNode;
  right?: ClusterNode;
}

export interface VisualizationSettings {
  mode: ViewMode;
  shape: CellShape;
  spacing: number;
  border: boolean;
  metabolismColorTarget: MetabolismColorTarget;
  heatmapMetabolismColorTarget: Exclude<MetabolismColorTarget, 'cell'>;
  fillStyles: { module: 'solid' | 'quartile'; gene: 'solid' | 'heatmap'; key: 'solid' | 'heatmap' };
  heatmapColors: HeatmapColors;
  heatmapScaling: HeatmapScaling;
  showAllRows: boolean;
  clustering: boolean;
  cellSize: number;
  fontSize: number;
  zoom: number;
  rotation: FigureRotation;
  swapSideLabels: boolean;
  presentColor: string;
  absentColor: string;
  metabolismColors: Record<string, string>;
  metabolismOrder: string[];
  visibleMetabolisms: Record<string, boolean>;
  visibleFeatures: Partial<Record<ViewMode, Record<string, boolean>>>;
}
