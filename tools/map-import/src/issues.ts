/** Problema encontrado ao importar um mapa: camada, objeto e regra violada. */
export interface ImportIssue {
  /** Camada do Tiled, ou `(mapa)` para o que vale para o mapa todo. */
  readonly layer: string;
  /** Id (nome) do objeto, `#<n>` para objeto sem nome, ou `-` quando não há objeto. */
  readonly objectId: string;
  /** Identificador estável da regra. */
  readonly rule: string;
  readonly message: string;
}

export const MAP_LAYER = '(mapa)';
export const NO_OBJECT = '-';

export function issue(layer: string, objectId: string, rule: string, message: string): ImportIssue {
  return { layer, objectId, rule, message };
}

export function formatIssue(file: string, found: ImportIssue): string {
  return `${file}: camada "${found.layer}", objeto "${found.objectId}": ${found.message} [regra ${found.rule}]`;
}
