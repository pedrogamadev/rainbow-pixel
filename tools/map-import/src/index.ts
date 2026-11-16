// pnpm maps:import  -> lê packages/maps/tiled/*.tmj, valida e grava packages/maps/generated/*.json
// pnpm maps:check   -> valida sem gravar e confere se os gerados estão atualizados (usado no CI)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { formatIssue } from './issues.js';
import {
  DEFAULT_GENERATED_DIR,
  DEFAULT_TILED_DIR,
  importMapFile,
  listTiledFiles,
  renderMapJson,
} from './importer.js';

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
    'tiled-dir': { type: 'string' },
    'out-dir': { type: 'string' },
  },
});

const tiledDir = values['tiled-dir'] ?? DEFAULT_TILED_DIR;
const outDir = values['out-dir'] ?? DEFAULT_GENERATED_DIR;
const files = listTiledFiles(tiledDir);

if (files.length === 0) {
  console.error(`Nenhum arquivo .tmj em ${tiledDir}.`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const label = relative(process.cwd(), file);
  const result = importMapFile(file);
  if (result.map === null) {
    failed = true;
    for (const found of result.issues) {
      console.error(formatIssue(label, found));
    }
    continue;
  }

  const outFile = join(outDir, `${result.id}.json`);
  const text = renderMapJson(result.map);
  if (values.check) {
    const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : null;
    if (current !== text) {
      failed = true;
      console.error(
        `${label}: ${relative(process.cwd(), outFile)} está desatualizado. Rode pnpm maps:import.`,
      );
    } else {
      console.info(`${label}: ok`);
    }
  } else {
    writeFileSync(outFile, text);
    console.info(`${label} -> ${relative(process.cwd(), outFile)}`);
  }
}

if (failed) {
  process.exit(1);
}
