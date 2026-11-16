import { HUD_CONFIG } from '@rainbow-pixel/shared';
import type { MatchEvent } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { ShotEffects } from './shots.js';

const ORIGIN = { x: 0, y: 0 };
const END = { x: 100, y: 0 };

function shot(eventId: number, shooterId: string): MatchEvent {
  return { kind: 'shot', eventId, tick: 1, shooterId, weaponId: 'm4a1', origin: ORIGIN, end: END };
}

function kill(eventId: number): MatchEvent {
  return { kind: 'kill', eventId, tick: 1, killerId: 'a', victimId: 'b', weaponId: 'm4a1' };
}

describe('ShotEffects', () => {
  it('tracer local na hora; o evento shot do próprio jogador não desenha outro', () => {
    const effects = new ShotEffects('eu');
    effects.addLocalShot(ORIGIN, END, 0);
    effects.onEvent(shot(1, 'eu'), 10);
    expect(effects.tracers(10)).toHaveLength(1);
    expect(effects.tracers(10)[0]?.own).toBe(true);
  });

  it('tracers dos outros vêm dos eventos shot e somem em ~80 ms', () => {
    const effects = new ShotEffects('eu');
    effects.onEvent(shot(1, 'outro'), 0);
    expect(effects.tracers(40)).toEqual([
      { from: ORIGIN, to: END, own: false, alpha: 1 - 40 / HUD_CONFIG.tracerMs },
    ]);
    expect(effects.tracers(HUD_CONFIG.tracerMs)).toEqual([]);
  });

  it('marcador de acerto com hit_confirm e arco de dano com damage_taken', () => {
    const effects = new ShotEffects('eu');
    expect(effects.hitMarker(0)).toBeNull();
    effects.onEvent(
      { kind: 'hit_confirm', eventId: 1, tick: 1, seq: 3, targetId: 'b', damage: 32, killed: true },
      0,
    );
    expect(effects.hitMarker(0)).toEqual({ alpha: 1, killed: true });
    expect(effects.hitMarker(HUD_CONFIG.hitMarkerMs)).toBeNull();
    effects.onEvent({ kind: 'damage_taken', eventId: 2, tick: 1, damage: 32, origin: END }, 0);
    expect(effects.damageIndicators(0)).toEqual([{ origin: END, alpha: 1 }]);
    expect(effects.damageIndicators(HUD_CONFIG.damageIndicatorMs)).toEqual([]);
  });

  it('feed com os últimos 4 abates, cada um por 5 s', () => {
    const effects = new ShotEffects('eu');
    for (let id = 1; id <= 6; id += 1) effects.onEvent(kill(id), id * 100);
    expect(effects.killFeed(700).map((entry) => entry.eventId)).toEqual([3, 4, 5, 6]);
    expect(effects.killFeed(300 + HUD_CONFIG.killFeedMs).map((entry) => entry.eventId)).toEqual([
      4, 5, 6,
    ]);
  });
});
