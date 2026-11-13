import { describe, expect, it } from 'vitest';
import {
  clearReconnectionToken,
  loadReconnectionToken,
  saveReconnectionToken,
} from './reconnectionToken';
import type { TokenStorage } from './reconnectionToken';

function memoryStorage(): TokenStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

function brokenStorage(): TokenStorage {
  const fail = (): never => {
    throw new Error('armazenamento bloqueado');
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

describe('token de reconexão', () => {
  it('devolve o token salvo para a sala a que ele pertence', () => {
    const storage = memoryStorage();
    saveReconnectionToken(storage, 'ABC234:segredo');

    expect(loadReconnectionToken(storage, 'ABC234')).toBe('ABC234:segredo');
  });

  it('ignora token de outra sala', () => {
    const storage = memoryStorage();
    saveReconnectionToken(storage, 'ABC234:segredo');

    expect(loadReconnectionToken(storage, 'XYZ789')).toBeNull();
  });

  it('ignora token sem a parte secreta', () => {
    const storage = memoryStorage();
    saveReconnectionToken(storage, 'ABC234:');

    expect(loadReconnectionToken(storage, 'ABC234')).toBeNull();
  });

  it('não devolve nada quando não há token ou ele foi apagado', () => {
    const storage = memoryStorage();
    expect(loadReconnectionToken(storage, 'ABC234')).toBeNull();

    saveReconnectionToken(storage, 'ABC234:segredo');
    clearReconnectionToken(storage);
    expect(loadReconnectionToken(storage, 'ABC234')).toBeNull();
  });

  it('guarda só o token mais recente', () => {
    const storage = memoryStorage();
    saveReconnectionToken(storage, 'ABC234:antigo');
    saveReconnectionToken(storage, 'ABC234:novo');

    expect(loadReconnectionToken(storage, 'ABC234')).toBe('ABC234:novo');
  });

  it('não quebra quando o armazenamento do navegador falha', () => {
    const storage = brokenStorage();

    expect(() => saveReconnectionToken(storage, 'ABC234:segredo')).not.toThrow();
    expect(loadReconnectionToken(storage, 'ABC234')).toBeNull();
    expect(() => clearReconnectionToken(storage)).not.toThrow();
  });
});
