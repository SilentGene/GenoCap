import { describe, expect, it } from 'vitest';
import { databaseToTsv, mergeDatabaseEntries, parseDatabaseTsv } from './database';

const header = 'Metabolism\tPathway\tModule\tKO\tgene_name\tif_key';

describe('database TSV handling', () => {
  it('parses a valid database and round-trips quoted fields', () => {
    const result = parseDatabaseTsv(`${header}\r\nNitrogen\tDenitrification\t"Nitrate\tto nitrite"\tK00370\tnarG\tyes\r\n`);
    expect(result.errors).toEqual([]);
    expect(result.entries[0]).toMatchObject({ module: 'Nitrate\tto nitrite', ko: 'K00370', geneName: 'narG', isKey: true });
    expect(parseDatabaseTsv(databaseToTsv(result.entries))).toEqual(result);
  });

  it('accepts comma, semicolon, and pipe-separated alternative KOs', () => {
    for (const ko of ['K01183, K13381', 'K01183; K13381', 'K01183|K13381']) {
      const result = parseDatabaseTsv(`${header}\nCarbon\tDegradation\tChitin\t${ko}\tchitinase\tyes`);
      expect(result.errors).toEqual([]);
      expect(result.entries[0].ko).toBe(ko);
    }
  });

  it('rejects missing headers, invalid KOs, blank required fields, and invalid key flags', () => {
    expect(parseDatabaseTsv('Metabolism\tKO\nNitrogen\tK00370').errors.some((error) => error.field === 'header')).toBe(true);
    const result = parseDatabaseTsv(`${header}\nNitrogen\tDenitrification\t\tK370\tnarG\ttrue`);
    expect(result.errors.map((error) => error.field)).toEqual(['Module', 'KO', 'if_key']);
  });

  it('appends while removing only fully duplicated records', () => {
    const first = parseDatabaseTsv(`${header}\nNitrogen\tDenitrification\tNitrate\tK00370\tnarG\tyes`).entries[0];
    const second = { ...first, ko: 'K02567', geneName: 'napA' };
    const result = mergeDatabaseEntries([first], [first, second], 'append');
    expect(result.entries).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.entries.map((entry) => entry.sourceIndex)).toEqual([0, 1]);
  });
});
