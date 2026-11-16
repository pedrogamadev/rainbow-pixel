import { NET_CONFIG } from '@rainbow-pixel/shared';
import type { ResolvedShot } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { EventLog, eventsFromShots } from './events.js';

function shot(shooterId: string, hit: ResolvedShot['hit']): ResolvedShot {
  return {
    shooterId,
    weaponId: 'm4a1',
    origin: { x: 10, y: 20 },
    angle: 0,
    shotIndex: 0,
    end: { x: 300, y: 20 },
    hit,
  };
}

describe('eventsFromShots', () => {
  it('tiro sem acerto vira só um shot para todos', () => {
    expect(eventsFromShots(5, [shot('a', null)], () => 9)).toEqual([
      {
        to: 'all',
        body: {
          kind: 'shot',
          tick: 5,
          shooterId: 'a',
          weaponId: 'm4a1',
          origin: { x: 10, y: 20 },
          end: { x: 300, y: 20 },
        },
      },
    ]);
  });

  it('acerto que mata: shot e kill para todos, hit_confirm para o atirador, damage_taken para a vítima', () => {
    const hit = { targetId: 'b', damage: 32, killed: true, friendly: false };
    const events = eventsFromShots(7, [shot('a', hit)], (id) => (id === 'a' ? 41 : 0));
    expect(events.map((event) => [event.body.kind, event.to])).toEqual([
      ['shot', 'all'],
      ['hit_confirm', 'a'],
      ['damage_taken', 'b'],
      ['kill', 'all'],
    ]);
    expect(events[1]?.body).toMatchObject({ seq: 41, targetId: 'b', damage: 32, killed: true });
    expect(events[2]?.body).toMatchObject({ damage: 32, origin: { x: 10, y: 20 } });
    expect(events[3]?.body).toMatchObject({ killerId: 'a', victimId: 'b', weaponId: 'm4a1' });
  });
});

describe('EventLog', () => {
  const kill = eventsFromShots(
    1,
    [shot('a', { targetId: 'b', damage: 32, killed: true, friendly: false })],
    () => 3,
  );

  it('numera os eventos em ordem crescente e entrega cada um só a quem deve', () => {
    const log = new EventLog();
    for (const viewer of ['a', 'b', 'c']) log.open(viewer);
    log.publish(kill);
    const kinds = (viewer: string) => log.takeForSnapshot(viewer).map((event) => event.kind);
    expect(kinds('a')).toEqual(['shot', 'hit_confirm', 'kill']);
    expect(kinds('b')).toEqual(['shot', 'damage_taken', 'kill']);
    expect(kinds('c')).toEqual(['shot', 'kill']);
  });

  it('repete os eventos nos 3 snapshots seguintes e depois para', () => {
    const log = new EventLog();
    log.open('c');
    log.publish(kill);
    const ids = Array.from({ length: NET_CONFIG.eventRedundancySnapshots + 2 }, () =>
      log.takeForSnapshot('c').map((event) => event.eventId),
    );
    const first = ids[0] ?? [];
    expect(first).toHaveLength(2);
    for (let snapshot = 1; snapshot <= NET_CONFIG.eventRedundancySnapshots; snapshot += 1) {
      expect(ids[snapshot]).toEqual(first);
    }
    expect(ids[NET_CONFIG.eventRedundancySnapshots + 1]).toEqual([]);
  });

  it('eventos novos vêm depois dos repetidos, em ordem de eventId', () => {
    const log = new EventLog();
    log.open('c');
    log.publish(kill);
    log.takeForSnapshot('c');
    log.publish(eventsFromShots(2, [shot('d', null)], () => 0));
    const ids = log.takeForSnapshot('c').map((event) => event.eventId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids).toHaveLength(3);
  });

  it('quem não está aberto (bot ou desconectado) não acumula eventos', () => {
    const log = new EventLog();
    log.publish(kill);
    expect(log.takeForSnapshot('ninguém')).toEqual([]);
    log.open('a');
    log.close('a');
    log.publish(kill);
    expect(log.takeForSnapshot('a')).toEqual([]);
  });
});
