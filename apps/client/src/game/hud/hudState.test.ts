import { createPlayerState } from '@rainbow-pixel/shared';
import type { PlayerSimState, SnapshotSelf } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { buildHudState } from './hudState.js';

const predicted = createPlayerState({ playerId: 'eu', team: 0, x: 0, y: 0 });

function server(overrides: Partial<SnapshotSelf> = {}): SnapshotSelf {
  return {
    x: 0,
    y: 0,
    aimAngle: 0,
    moveMode: 'walk',
    health: 73,
    alive: true,
    respawnInMs: null,
    weapon: predicted.weapon,
    dev: { god: false, noSpread: false },
    ...overrides,
  };
}

const names = new Map([
  ['eu', 'dev1'],
  ['b', 'BOT Fácil 1'],
]);
const nickname = (id: string) => names.get(id) ?? '?';

describe('buildHudState', () => {
  it('mostra a vida do servidor e a munição prevista da arma na mão', () => {
    const shot: PlayerSimState = {
      ...predicted,
      weapon: { ...predicted.weapon, ammo: { primary: 27, secondary: 15 } },
    };
    expect(buildHudState(shot, server(), [], 'eu', nickname)).toMatchObject({
      health: 73,
      alive: true,
      respawnSeconds: null,
      weaponName: 'M4A1',
      ammo: 27,
      magazine: 30,
      reloadProgress: null,
      switchProgress: null,
    });
  });

  it('barras de recarga e de troca', () => {
    const reloading: PlayerSimState = {
      ...predicted,
      weapon: { ...predicted.weapon, reloadLeftMs: 600 },
    };
    expect(buildHudState(reloading, server(), [], 'eu', nickname)?.reloadProgress).toBeCloseTo(
      0.75,
      9,
    );
    const switching: PlayerSimState = {
      ...predicted,
      weapon: { ...predicted.weapon, activeSlot: 'secondary', switchLeftMs: 100 },
    };
    expect(buildHudState(switching, server(), [], 'eu', nickname)).toMatchObject({
      weaponName: 'M9',
      magazine: 15,
      switchProgress: 0.75,
    });
  });

  it('morto: tela de morte com a contagem até renascer', () => {
    expect(
      buildHudState(
        predicted,
        server({ alive: false, health: 0, respawnInMs: 2100 }),
        [],
        'eu',
        nickname,
      ),
    ).toMatchObject({ alive: false, respawnSeconds: 3 });
  });

  it('feed de abates com nicknames e o nome da arma', () => {
    const hud = buildHudState(
      predicted,
      server(),
      [{ eventId: 4, killerId: 'b', victimId: 'eu', weaponId: 'm4a1' }],
      'eu',
      nickname,
    );
    expect(hud?.killFeed).toEqual([
      { eventId: 4, killer: 'BOT Fácil 1', victim: 'dev1', weapon: 'M4A1', involvesSelf: true },
    ]);
  });

  it('sem estado ainda, não mostra nada', () => {
    expect(buildHudState(null, server(), [], 'eu', nickname)).toBeNull();
    expect(buildHudState(predicted, null, [], 'eu', nickname)).toBeNull();
  });
});
