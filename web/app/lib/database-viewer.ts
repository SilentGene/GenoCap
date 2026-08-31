import { databaseToTsv, DATABASE_HEADERS } from './database';
import type { DatabaseEntry } from './types';

export function openDatabaseViewer(entries: DatabaseEntry[]): boolean {
  const viewer = window.open('', '_blank', 'popup=yes,width=1280,height=800');
  if (!viewer) return false;

  viewer.document.title = 'Current database · GenoCap';
  viewer.document.documentElement.lang = 'en';
  viewer.document.body.innerHTML = `
    <style>
      :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #1f1f1f; background: #f5f5f5; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f5f5f5; }
      header { position: sticky; z-index: 2; top: 0; display: flex; min-height: 68px; padding: 14px 20px; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid #e8e8e8; background: rgba(255,255,255,.96); backdrop-filter: blur(10px); }
      h1 { margin: 0; font-size: 20px; line-height: 28px; }
      p { margin: 2px 0 0; color: #737373; font-size: 12px; }
      .actions { display: flex; align-items: center; gap: 10px; }
      input { width: min(32vw, 360px); height: 36px; padding: 0 11px; border: 1px solid #d9d9d9; border-radius: 7px; outline: none; font: inherit; }
      input:focus { border-color: #4096ff; box-shadow: 0 0 0 2px rgba(5,145,255,.1); }
      button { height: 36px; padding: 0 16px; border: 1px solid #1677ff; border-radius: 7px; background: #1677ff; color: white; cursor: pointer; font: inherit; font-weight: 500; }
      button:hover { background: #4096ff; }
      main { padding: 16px; }
      .table-shell { overflow: auto; border: 1px solid #e8e8e8; border-radius: 10px; background: white; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
      table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; white-space: nowrap; }
      th { position: sticky; z-index: 1; top: 0; padding: 10px 12px; border-bottom: 1px solid #d9d9d9; background: #fafafa; color: #434343; text-align: left; }
      td { max-width: 480px; padding: 8px 12px; overflow: hidden; border-bottom: 1px solid #f0f0f0; color: #262626; text-overflow: ellipsis; }
      tr:last-child td { border-bottom: 0; }
      tbody tr:hover td { background: #f5faff; }
      .empty { padding: 48px; color: #8c8c8c; text-align: center; }
      @media (max-width: 720px) { header { align-items: stretch; flex-direction: column; } .actions { align-items: stretch; } input { width: 100%; } }
    </style>
    <header>
      <div><h1>Current GenoCap database</h1><p id="record-count"></p></div>
      <div class="actions"><input id="database-search" type="search" placeholder="Search all columns…" aria-label="Search database"><button id="database-download" type="button">Download TSV</button></div>
    </header>
    <main><div class="table-shell"><table><thead><tr></tr></thead><tbody></tbody></table><div class="empty" hidden>No matching records.</div></div></main>`;

  const document = viewer.document;
  const headerRow = document.querySelector('thead tr');
  const body = document.querySelector('tbody');
  const count = document.querySelector('#record-count');
  const search = document.querySelector<HTMLInputElement>('#database-search');
  const download = document.querySelector<HTMLButtonElement>('#database-download');
  const empty = document.querySelector<HTMLElement>('.empty');
  if (!headerRow || !body || !count || !search || !download || !empty) return true;

  for (const label of DATABASE_HEADERS) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headerRow.append(cell);
  }

  const searchableRows: { element: HTMLTableRowElement; text: string }[] = [];
  for (const entry of entries) {
    const row = document.createElement('tr');
    const values = [entry.metabolism, entry.pathway, entry.module, entry.ko, entry.geneName, entry.isKey ? 'yes' : ''];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      cell.title = value;
      row.append(cell);
    }
    body.append(row);
    searchableRows.push({ element: row, text: values.join('\u001f').toLocaleLowerCase() });
  }

  const updateCount = (visible: number) => { count.textContent = `${visible.toLocaleString()} of ${entries.length.toLocaleString()} records`; };
  updateCount(entries.length);
  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of searchableRows) {
      const show = !query || row.text.includes(query);
      row.element.hidden = !show;
      if (show) visible += 1;
    }
    empty.hidden = visible !== 0;
    updateCount(visible);
  });
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([databaseToTsv(entries)], { type: 'text/tab-separated-values;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'GenoCap_db.tsv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  });
  search.focus();
  return true;
}
