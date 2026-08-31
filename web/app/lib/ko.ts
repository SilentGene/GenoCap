const KO_PATTERN = /^K\d{5}$/;

export interface ParsedKoCell {
  kos: string[];
  reason?: string;
}

export function splitKoCell(raw: string): ParsedKoCell {
  const value = raw.trim();
  if (!value) return { kos: [] };
  const tokens = value.split(/[;,|]/).map((token) => token.trim());
  if (tokens.some((token) => token.length === 0)) {
    return { kos: [], reason: 'Empty KO between separators or after a trailing separator.' };
  }
  const invalid = tokens.find((token) => !KO_PATTERN.test(token));
  if (invalid) return { kos: [], reason: `Unrecognized KO token “${invalid}”. Expected K followed by five digits.` };
  return { kos: [...new Set(tokens)] };
}
