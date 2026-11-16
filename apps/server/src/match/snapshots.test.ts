import { createCollisionGrid, getMap } from '@rainbow-pixel/maps';
import { TICK_MS, createPlayerState, createWorld } from '@rainbow-pixel/shared';
import type { SimWorld } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshots.js';

const grid = createCollisionGrid(getMap('gym_01'));

function world(): SimWorld {
  return {
    ...createWorld(grid, [
      { ...createPlayerState({ playerId: 'eu', team: 0, x: 100, y: 100 }), health: 70 },
      { ...createPlayerState({ playerId: 'aliado', team: 0, x: 200, y: 100 }), health: 55 },
      { ...createPlayerState({ playerId: 'inimigo', team: 1, x: 300, y: 100 }), health: 12 },
      {
        ...createPlayerState({ playerId: 'morto', team: 1, x: 400, y: 100 }),
        health: 0,
        alive: false,
        respawnAtTick: 130,
      },
    ]),
    tick: 100,
  };
}

function snapshotFor(viewerId: string) {
  return buildSnapshot({
    world: world(),
    viewerId,
    ackSeq: 3,
    serverTimeMs: 5000,
    isConnected: (id) => id !== 'aliado',
    devFlags: { god: true, noSpread: false },
  });
}

describe('buildSnapshot', () => {
  it('vida vai só para o próprio jogador e para os aliados', () => {
    const players = new Map(snapshotFor('eu').players.map((player) => [player.playerId, player]));
    expect(players.get('eu')?.health).toBe(70);
    expect(players.get('aliado')?.health).toBe(55);
    expect(players.get('inimigo')).not.toHaveProperty('health');
    expect(players.get('morto')).not.toHaveProperty('health');
  });

  it('do outro lado, a vida que aparece é a do outro time', () => {
    const players = new Map(
      snapshotFor('inimigo').players.map((player) => [player.playerId, player]),
    );
    expect(players.get('inimigo')?.health).toBe(12);
    expect(players.get('morto')?.health).toBe(0);
    expect(players.get('eu')).not.toHaveProperty('health');
    expect(players.get('aliado')).not.toHaveProperty('health');
  });

  it('players traz time, alive, arma na mão e conexão de todos', () => {
    const snapshot = snapshotFor('eu');
    expect(snapshot.players.map((player) => [player.playerId, player.team, player.alive])).toEqual([
      ['eu', 0, true],
      ['aliado', 0, true],
      ['inimigo', 1, true],
      ['morto', 1, false],
    ]);
    expect(snapshot.players.every((player) => player.activeSlot === 'primary')).toBe(true);
    expect(snapshot.players.find((player) => player.playerId === 'aliado')?.connected).toBe(false);
  });

  it('self traz o estado completo do próprio jogador e os comandos de debug ativos', () => {
    const { self } = snapshotFor('eu');
    expect(self).toMatchObject({
      x: 100,
      y: 100,
      health: 70,
      alive: true,
      respawnInMs: null,
      dev: { god: true, noSpread: false },
    });
    expect(self?.weapon.ammo).toEqual({ primary: 30, secondary: 15 });
  });

  it('self de quem está morto traz o tempo até renascer', () => {
    expect(snapshotFor('morto').self?.respawnInMs).toBeCloseTo(30 * TICK_MS, 6);
  });

  it('quem não está na partida recebe self nulo e nenhuma vida', () => {
    const snapshot = snapshotFor('espectador');
    expect(snapshot.self).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('health');
  });
});
