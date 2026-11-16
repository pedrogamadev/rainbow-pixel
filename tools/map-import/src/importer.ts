import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MapDefinition } from '@rainbow-pixel/maps/format';
import { convertTiledMap } from './convert.js';
import { MAP_LAYER, NO_OBJECT, issue } from './issues.js';
import type { ImportIssue } from './issues.js';
import { validateMap } from './validate.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Fontes do Tiled e saída do importador, em packages/maps. */
export const DEFAULT_TILED_DIR = join(REPO_ROOT, 'packages', 'maps', 'tiled');
export const DEFAULT_GENERATED_DIR = join(REPO_ROOT, 'packages', 'maps', 'generated');

export interface ImportedMap {
  /** Nome do arquivo sem extensão, que também é o id do mapa. */
  readonly id: string;
  readonly file: string;
  readonly map: MapDefinition | null;
  readonly issues: readonly ImportIssue[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Lê, converte e valida um arquivo .tmj. */
export function importMapFile(file: string): ImportedMap {
  const id = basename(file).replace(/\.tmj$/i, '');
  if (!/^[a-z0-9_]+$/.test(id)) {
    return {
      id,
      file,
      map: null,
      issues: [
        issue(
          MAP_LAYER,
          NO_OBJECT,
          'map_id',
          'o nome do arquivo (id do mapa) só pode ter a-z, 0-9 e _',
        ),
      ],
    };
  }
  let json: unknown;
  try {
    json = readJson(file);
  } catch {
    return {
      id,
      file,
      map: null,
      issues: [issue(MAP_LAYER, NO_OBJECT, 'tiled_format', 'arquivo não é um JSON válido')],
    };
  }
  const converted = convertTiledMap({
    id,
    json,
    loadTileset: (source) => readJson(join(dirname(file), source)),
  });
  if (converted.map === null) {
    return { id, file, map: null, issues: converted.issues };
  }
  const issues = validateMap(converted.map);
  return { id, file, map: issues.length === 0 ? converted.map : null, issues };
}

export function listTiledFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.tmj'))
    .sort()
    .map((name) => join(dir, name));
}

/** Texto gravado em generated/<id>.json. */
export function renderMapJson(map: MapDefinition): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}
