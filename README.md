# GenoCap

GenoCap is a browser-based tool for exploring genome capabilities from KEGG annotations across genome collections. Files are processed locally and are never uploaded.

## Live application

[Open GenoCap](https://silentgene.github.io/GenoCap/)

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

## Quality checks

```powershell
cd web
npm test
npm run lint
npm run build
```
