import { getMap } from '@rainbow-pixel/maps';
import { describe, expect, it } from 'vitest';
import { NoSpawnError, assignSpawns } from './spawns.js';

const map = getMap('gym_01');

describe('assignSpawns', () => {
  const players = [
    { playerId: 'ana', team: 0 },
    { playerId: 'bot:1', team: 1 },
    { playerId: 'bot:2', team: 0 },
    { playerId: 'bot:3', team: 1 },
  ] as const;

  it('time 0 nasce nos pontos de spawn_attack, pela ordem de entrada', () => {
    const spawns = assignSpawns(map, players);
    const [first, second] = map.objects.spawnAttack;
    expect(spawns.get('ana')).toEqual({ x: first?.x, y: first?.y });
    expect(spawns.get('bot:2')).toEqual({ x: second?.x, y: second?.y });
  });

  it('time 1 nasce em pontos diferentes dentro de spawn_defense', () => {
    const spawns = assignSpawns(map, players);
    const zone = map.objects.spawnDefense[0]?.rect;
    if (zone === undefined) throw new Error('gym_01 sem spawn_defense');
    const defenders = [spawns.get('bot:1'), spawns.get('bot:3')];
    for (const spawn of defenders) {
      expect(spawn?.x).toBeGreaterThan(zone.x);
      expect(spawn?.x).toBeLessThan(zone.x + zone.w);
      expect(spawn?.y).toBeGreaterThan(zone.y);
      expect(spawn?.y).toBeLessThan(zone.y + zone.h);
    }
    expect(defenders[0]).not.toEqual(defenders[1]);
  });

  it('é determinístico', () => {
    expect(assignSpawns(map, players)).toEqual(assignSpawns(map, players));
  });

  it('com mais atacantes que pontos, volta ao primeiro ponto', () => {
    const attackers = ['a', 'b', 'c', 'd'].map((playerId) => ({ playerId, team: 0 as const }));
    const spawns = assignSpawns(map, attackers);
    expect(spawns.get('d')).toEqual(spawns.get('a'));
  });

  it('recusa mapa sem spawn para o time', () => {
    const empty = { ...map, objects: { ...map.objects, spawnDefense: [] } };
    expect(() => assignSpawns(empty, players)).toThrow(NoSpawnError);
  });
});
