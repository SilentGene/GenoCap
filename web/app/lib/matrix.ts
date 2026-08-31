import type { AnnotationRecord, DatabaseEntry, FeatureRow, MatrixModel, ViewMode } from './types';
import { splitKoCell } from './ko';

interface FeatureDefinition {
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
  quarterFill = true,
  visibleMetabolisms?: Set<string>,
): MatrixModel {
  const genomeKoGenes = new Map(genomes.map((genome) => [genome, new Map<string, Set<string>>() ]));
  for (const record of records) {
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
      const value = mode === 'module' && quarterFill ? Math.round(rawValue * 4) / 4 : Number(hits > 0);
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
      return [genome, { value, rawValue, hits, total: koGroups.length, matchedGenes }];
    }));
    return { ...definition, kos, cells };
  }).filter((row) => showAllRows || genomes.some((genome) => row.cells[genome].value > 0));

  return { mode, genomes, rows };
}

function buildDefinitions(database: DatabaseEntry[], mode: ViewMode, visibleMetabolisms?: Set<string>): FeatureDefinition[] {
  const groups = new Map<string, FeatureDefinition>();
  for (const entry of database) {
    if (visibleMetabolisms && !visibleMetabolisms.has(entry.metabolism)) continue;
    if (mode === 'key' && !entry.isKey) continue;
    const parts = mode === 'module'
      ? [entry.metabolism, entry.module]
      : [entry.metabolism, entry.module, entry.geneName];
    const id = parts.join('\u001f');
    const alternatives = splitKoCell(entry.ko).kos;
    if (!alternatives.length) continue;
    const groupKey = alternatives.toSorted().join('\u001e');
    const current = groups.get(id);
    if (current) {
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
      id,
      metabolism: entry.metabolism,
      pathway: entry.pathway,
      module: entry.module,
      feature: mode === 'module' ? entry.module : entry.geneName,
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
