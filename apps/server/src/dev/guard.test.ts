import { describe, expect, it } from 'vitest';
import {
  DevToolsGuardError,
  assertDevToolsAllowed,
  assertDevToolsEnabled,
  isDevToolsEnabled,
} from './guard.js';

describe('assertDevToolsAllowed', () => {
  it('recusa DEV_TOOLS=true com NODE_ENV=production', () => {
    expect(() => assertDevToolsAllowed({ DEV_TOOLS: 'true', NODE_ENV: 'production' })).toThrow(
      DevToolsGuardError,
    );
  });

  it('recusa mesmo com maiúsculas ou espaços nos valores', () => {
    expect(() => assertDevToolsAllowed({ DEV_TOOLS: ' TRUE ', NODE_ENV: 'Production' })).toThrow(
      DevToolsGuardError,
    );
  });

  it('explica o motivo na mensagem', () => {
    expect(() => assertDevToolsAllowed({ DEV_TOOLS: 'true', NODE_ENV: 'production' })).toThrow(
      /DEV_TOOLS=true.*NODE_ENV=production/,
    );
  });

  it('aceita DEV_TOOLS=true fora de produção', () => {
    expect(() =>
      assertDevToolsAllowed({ DEV_TOOLS: 'true', NODE_ENV: 'development' }),
    ).not.toThrow();
    expect(() => assertDevToolsAllowed({ DEV_TOOLS: 'true' })).not.toThrow();
  });

  it('aceita produção com DEV_TOOLS desligado', () => {
    expect(() =>
      assertDevToolsAllowed({ DEV_TOOLS: 'false', NODE_ENV: 'production' }),
    ).not.toThrow();
    expect(() => assertDevToolsAllowed({ NODE_ENV: 'production' })).not.toThrow();
  });
});

describe('assertDevToolsEnabled', () => {
  it('recusa quando DEV_TOOLS não é true', () => {
    expect(() => assertDevToolsEnabled({ NODE_ENV: 'development' })).toThrow(DevToolsGuardError);
    expect(() => assertDevToolsEnabled({ DEV_TOOLS: 'false' })).toThrow(DevToolsGuardError);
    expect(() => assertDevToolsEnabled({ DEV_TOOLS: '1' })).toThrow(DevToolsGuardError);
  });

  it('recusa em produção mesmo com DEV_TOOLS=true', () => {
    expect(() => assertDevToolsEnabled({ DEV_TOOLS: 'true', NODE_ENV: 'production' })).toThrow(
      DevToolsGuardError,
    );
  });

  it('aceita DEV_TOOLS=true fora de produção', () => {
    expect(() =>
      assertDevToolsEnabled({ DEV_TOOLS: 'true', NODE_ENV: 'development' }),
    ).not.toThrow();
  });
});

describe('isDevToolsEnabled', () => {
  it('só liga com o valor true', () => {
    expect(isDevToolsEnabled({ DEV_TOOLS: 'true' })).toBe(true);
    expect(isDevToolsEnabled({ DEV_TOOLS: 'false' })).toBe(false);
    expect(isDevToolsEnabled({ DEV_TOOLS: '' })).toBe(false);
    expect(isDevToolsEnabled({})).toBe(false);
  });
});
