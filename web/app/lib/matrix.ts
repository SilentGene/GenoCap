import type { AnnotationRecord, DatabaseEntry, FeatureRow, FillStyle, MatrixModel, ViewMode } from './types';
import { splitKoCell } from './ko';

interface FeatureDefinition {
  geneFunctions: string[];
  id: string;
  metabolism: string;
  pathway: string;
  module: string;
  feature: string;
  koGroups: Map<string, string[]>;
  geneNamesByKo: Map<string, Set<string>>;
  sourceIndex: number;
}

export function buildMatrix(
  database: DatabaseEntry[],
  records: AnnotationRecord[],
  genomes: string[],
  mode: ViewMode,
  showAllRows: boolean,
  fillStyle: FillStyle = 'quartile',
  visibleMetabolisms?: Set<string>,
): MatrixModel {
  const genomeKoGenes = new Map(genomes.map((genome) => [genome, new Map<string, Set<string>>() ]));
  const abundances = new Map<string, Map<string, number>>();
  for (const record of records) {
    if (mode !== 'module' && record.geneAbundance !== undefined) {
      const genes = abundances.get(record.genome) ?? new Map<string, number>();
      if (!genes.has(record.gene)) genes.set(record.gene, record.geneAbundance);
      abundances.set(record.genome, genes);
    }
    const koGenes = genomeKoGenes.get(record.genome);
    record.kos.forEach((ko) => {
      if (!koGenes) return;
      const genes = koGenes.get(ko) ?? new Set<string>();
      genes.add(record.gene);
      koGenes.set(ko, genes);
    });
  }

  const definitions = buildDefinitions(database, mode, visibleMetabolisms);
  const rows: FeatureRow[] = definitions.map((definition) => {
    const koGroups = [...definition.koGroups.values()];
    const kos = [...new Set(koGroups.flat())];
    const cells = Object.fromEntries(genomes.map((genome) => {
      const available = genomeKoGenes.get(genome) ?? new Map<string, Set<string>>();
      const hits = koGroups.filter((group) => group.some((ko) => available.has(ko))).length;
      const rawValue = koGroups.length ? hits / koGroups.length : 0;
      const pairKeys = new Set<string>();
      const matchedGenes: { geneId: string; ko: string; geneName: string }[] = [];
      for (const ko of kos) {
        const geneIds = available.get(ko);
        const geneNames = definition.geneNamesByKo.get(ko);
        if (!geneIds || !geneNames) continue;
        for (const geneId of geneIds) for (const geneName of geneNames) {
          const pairKey = `${geneId}\u001f${ko}\u001f${geneName}`;
          if (pairKeys.has(pairKey)) continue;
          pairKeys.add(pairKey);
          matchedGenes.push({ geneId, ko, geneName: geneName || 'NA' });
        }
      }
      const value = mode === 'module' && fillStyle === 'quartile'
        ? Math.round(rawValue * 4) / 4
        : mode !== 'module' && fillStyle === 'heatmap'
          ? [...new Set(matchedGenes.map(({ geneId }) => geneId))].reduce((sum, gene) => sum + (abundances.get(genome)?.get(gene) ?? 0), 0)
          : Number(hits > 0);
      return [genome, { value, rawValue, hits, total: koGroups.length, matchedGenes }];
    }));
    return { ...definition, kos, cells };
  }).filter((row) => showAllRows || genomes.some((genome) => row.cells[genome].hits > 0));

  return { mode, genomes, rows };
}

function buildDefinitions(database: DatabaseEntry[], mode: ViewMode, visibleMetabolisms?: Set<string>): FeatureDefinition[] {
  const groups = new Map<string, FeatureDefinition>();
  for (const entry of database) {
    if (visibleMetabolisms && !visibleMetabolisms.has(entry.metabolism)) continue;
    if (mode === 'key' && !entry.isKey) continue;
    const suffix = (mode === 'module' ? entry.geneCluster ?? '' : entry.geneName).trim();
    const parts = mode === 'module'
      ? [entry.metabolism, entry.module, suffix]
      : [entry.metabolism, entry.module, entry.geneName];
    const id = parts.join('\u001f');
    const alternatives = splitKoCell(entry.ko).kos;
    if (!alternatives.length) continue;
    const groupKey = alternatives.toSorted().join('\u001e');
    const geneFunction = entry.geneFunction?.trim() ?? '';
    const current = groups.get(id);
    if (current) {
      if (geneFunction && !current.geneFunctions.includes(geneFunction)) current.geneFunctions.push(geneFunction);
      if (!current.koGroups.has(groupKey)) current.koGroups.set(groupKey, alternatives);
      for (const ko of alternatives) {
        const geneNames = current.geneNamesByKo.get(ko) ?? new Set<string>();
        geneNames.add(entry.geneName);
        current.geneNamesByKo.set(ko, geneNames);
      }
      if (entry.pathway && !current.pathway.split('; ').includes(entry.pathway)) current.pathway += `; ${entry.pathway}`;
      continue;
    }
    groups.set(id, {
      geneFunctions: geneFunction ? [geneFunction] : [],
      id,
      metabolism: entry.metabolism,
      pathway: entry.pathway,
      module: entry.module,
      feature: suffix ? `${entry.module} (${suffix})` : entry.module,
      koGroups: new Map([[groupKey, alternatives]]),
      geneNamesByKo: new Map(alternatives.map((ko) => [ko, new Set([entry.geneName])])),
      sourceIndex: entry.sourceIndex,
    });
  }
  return [...groups.values()].sort((a, b) => a.sourceIndex - b.sourceIndex);
}

export const DEFAULT_METABOLISM_ORDER = [
  'C1 and methane metabolism',
  'Carbon fixation',
  'Nitrogen cycle',
  'Sulfur cycle',
  'Photosynthesis',
  'Fermentation and TCA',
  'Anaerobic Respiration',
  'Oxidative phosphorylation and stress',
  'Carbon source utilization',
  'Others',
] as const;

export const DEFAULT_METABOLISM_COLORS: Record<string, string> = {
  'C1 and methane metabolism': '#c9ba58',
  'Carbon fixation': '#7ce5c7',
  'Nitrogen cycle': '#d17f71',
  'Sulfur cycle': '#d68a25',
  Photosynthesis: '#81d171',
  'Fermentation and TCA': '#dd85a5',
  'Anaerobic Respiration': '#b07de2',
  'Oxidative phosphorylation and stress': '#8ad3ed',
  'Carbon source utilization': '#bf9e9e',
  Others: '#d3d3d3',
};
