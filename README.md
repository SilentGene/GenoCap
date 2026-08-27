# GenoCap

GenoCap is a browser-based tool for exploring genome capabilities from KEGG annotations across genome collections. Files are processed locally and are never uploaded.

## Live application

[Open GenoCap](https://silentgene.github.io/GenoCap/)

## Features

- Visualize KEGG annotations across multiple genomes in Module, Gene, or Key gene mode.
- Display binary presence or quartile module completeness using circles or squares.
- Filter metabolism groups, customize colors and layout, and cluster genomes.
- Export the complete visualization as SVG or PNG and the displayed matrix as CSV.
- Parse TSV and CSV files entirely in the browser, including multiple KO identifiers per cell.

## Run locally

Requirements: Node.js 22.13 or newer.

```powershell
cd web
npm install
npm run dev
```

Open `http://localhost:3000` in a browser. The database JSON is regenerated automatically from `db/Panfuc_db.tsv` whenever the development server or production build starts.

## GitHub Pages deployment

The application is exported as a fully static site. Every push to `main` runs the checks, builds `web/out`, and deploys it through GitHub Pages.

## Input

Select TSV or CSV in the interface, then upload a file containing the exact headers `gene`, `genome`, and `ko`. A KO cell may contain multiple identifiers separated by semicolons, commas, pipes, or a mixture of these. In CSV files, KO values containing commas must be quoted.

The supplied `doc/input_annotation.tsv` file can be used as a complete example.

## Project structure

- `web/` — Next.js and Ant Design application.
- `db/Panfuc_db.tsv` — authoritative functional reference database.
- `doc/` — example input and reference visualization.
- `.github/workflows/deploy-pages.yml` — automated GitHub Pages deployment.

## Quality checks

```powershell
cd web
npm test
npm run lint
npm run build
```

## License

GenoCap is licensed under the [GNU Affero General Public License v3.0](LICENSE).
