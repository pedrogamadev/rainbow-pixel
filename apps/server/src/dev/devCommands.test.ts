import { describe, expect, it, vi } from 'vitest';
import { handleDevCommand, parseDevCommand } from './devCommands.js';
import type { DevCommandTarget } from './devCommands.js';

function target(teleportOk = true): DevCommandTarget {
  return {
    teleport: vi.fn(() => teleportOk),
    setGod: vi.fn(),
    setNoSpread: vi.fn(),
  };
}

describe('parseDevCommand', () => {
  it('aceita os 3 comandos', () => {
    expect(parseDevCommand({ kind: 'teleport', x: 1, y: 2 })).toEqual({
      kind: 'teleport',
      x: 1,
      y: 2,
    });
    expect(parseDevCommand({ kind: 'god', enabled: true })).toEqual({ kind: 'god', enabled: true });
    expect(parseDevCommand({ kind: 'no_spread', enabled: false })).toEqual({
      kind: 'no_spread',
      enabled: false,
    });
  });

  it('recusa forma inválida', () => {
    expect(parseDevCommand({ kind: 'teleport', x: Number.NaN, y: 2 })).toBeNull();
    expect(parseDevCommand({ kind: 'teleport', x: '1', y: 2 })).toBeNull();
    expect(parseDevCommand({ kind: 'god' })).toBeNull();
    expect(parseDevCommand({ kind: 'fly', enabled: true })).toBeNull();
    expect(parseDevCommand(null)).toBeNull();
  });
});

describe('handleDevCommand', () => {
  it('com DEV_TOOLS=false, recusa com dev_tools_disabled e não mexe na partida', () => {
    const match = target();
    for (const payload of [
      { kind: 'teleport', x: 100, y: 100 },
      { kind: 'god', enabled: true },
      { kind: 'no_spread', enabled: true },
    ]) {
      expect(handleDevCommand({ devTools: false, match, playerId: 'eu', payload })).toEqual({
        ok: false,
        error: 'dev_tools_disabled',
      });
    }
    expect(match.teleport).not.toHaveBeenCalled();
    expect(match.setGod).not.toHaveBeenCalled();
    expect(match.setNoSpread).not.toHaveBeenCalled();
  });

  it('aplica sempre a quem enviou', () => {
    const match = target();
    handleDevCommand({
      devTools: true,
      match,
      playerId: 'eu',
      payload: { kind: 'god', enabled: true },
    });
    handleDevCommand({
      devTools: true,
      match,
      playerId: 'eu',
      payload: { kind: 'no_spread', enabled: true },
    });
    handleDevCommand({
      devTools: true,
      match,
      playerId: 'eu',
      payload: { kind: 'teleport', x: 50, y: 60 },
    });
    expect(match.setGod).toHaveBeenCalledWith('eu', true);
    expect(match.setNoSpread).toHaveBeenCalledWith('eu', true);
    expect(match.teleport).toHaveBeenCalledWith('eu', 50, 60);
  });

  it('teleporte para dentro de parede é recusado', () => {
    expect(
      handleDevCommand({
        devTools: true,
        match: target(false),
        playerId: 'eu',
        payload: { kind: 'teleport', x: 0, y: 0 },
      }),
    ).toEqual({ ok: false, error: 'teleport_blocked' });
  });

  it('fora da partida ou com payload inválido, recusa', () => {
    expect(
      handleDevCommand({
        devTools: true,
        match: null,
        playerId: 'eu',
        payload: { kind: 'god', enabled: true },
      }),
    ).toEqual({ ok: false, error: 'match_not_started' });
    expect(
      handleDevCommand({ devTools: true, match: target(), playerId: 'eu', payload: { kind: 'x' } }),
    ).toEqual({ ok: false, error: 'invalid_payload' });
  });
});
