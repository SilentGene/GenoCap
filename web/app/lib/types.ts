export type FileKind = 'tsv' | 'csv';
export type ViewMode = 'module' | 'gene' | 'key';
export type CellShape = 'circle' | 'square';
export type MetabolismColorTarget = 'background' | 'cell';
export type FigureRotation = 0 | 90 | 180 | 270;

export interface AnnotationRecord {
  gene: string;
  genome: string;
  kos: string[];
  sourceLine: number;
}

export interface InputValidationError {
  line: number;
  field: 'file' | 'header' | 'row' | 'gene' | 'genome' | 'ko';
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
  records: AnnotationRecord[];
  genomes: string[];
  errors: InputValidationError[];
  summary: ParseSummary;
}

export interface DatabaseEntry {
  metabolism: string;
  pathway: string;
  module: string;
  ko: string;
  geneName: string;
  isKey: boolean;
  sourceIndex: number;
}

export interface MatrixCell {
  value: number;
  rawValue: number;
  hits: number;
  total: number;
  matchedGenes: { geneId: string; ko: string; geneName: string }[];
}

export interface FeatureRow {
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
  quarterFill: boolean;
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
