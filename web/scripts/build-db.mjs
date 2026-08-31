import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../../db/GenoCap_db.tsv');
const outputPath = resolve(here, '../app/data/genocap-db.json');
const exampleSourcePath = resolve(here, '../../doc/input_annotation.tsv');
const exampleOutputPath = resolve(here, '../public/input_annotation.tsv');
const source = await readFile(sourcePath, 'utf8');
const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const headers = lines[0].split('\t');
const column = (name) => {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error(`Database column not found: ${name}`);
  return index;
};

const indexes = {
  metabolism: column('Metabolism'), pathway: column('Pathway'), module: column('Module'),
  ko: column('KO'), geneName: column('gene_name'), isKey: column('if_key'),
};

const cleanLabel = (value = '') => value.replaceAll('"', '').trim();
const splitKoCell = (value = '') => {
  const tokens = cleanLabel(value).split(/[;,|]/).map((token) => token.trim());
  return tokens.length > 0 && tokens.every((token) => /^K\d{5}$/.test(token))
    ? [...new Set(tokens)]
    : [];
};

const entries = lines.slice(1).map((line, sourceIndex) => {
  const fields = line.split('\t');
  return {
    metabolism: cleanLabel(fields[indexes.metabolism]),
    pathway: cleanLabel(fields[indexes.pathway]),
    module: cleanLabel(fields[indexes.module]),
    ko: cleanLabel(fields[indexes.ko]),
    geneName: cleanLabel(fields[indexes.geneName]),
    isKey: (fields[indexes.isKey]?.trim().toLowerCase() ?? '') === 'yes',
    sourceIndex,
  };
}).filter((entry) => splitKoCell(entry.ko).length > 0);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
await mkdir(dirname(exampleOutputPath), { recursive: true });
await copyFile(exampleSourcePath, exampleOutputPath);
console.log(`Generated ${entries.length} GenoCap database entries and copied the example annotation file.`);
