import { NET_CONFIG } from '@rainbow-pixel/shared';
import type { SnapshotMessage, SnapshotPlayer } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { InterpolationBuffer } from './interpolation.js';

function player(playerId: string, x: number, y: number, aimAngle = 0): SnapshotPlayer {
  return { playerId, team: 0, x, y, aimAngle, moveMode: 'walk', connected: true };
}

function snapshot(serverTimeMs: number, players: SnapshotPlayer[]): SnapshotMessage {
  return { tick: 0, serverTimeMs, ackSeq: 0, players };
}

function at(buffer: InterpolationBuffer, renderTimeMs: number, playerId = 'b') {
  return buffer.sample(renderTimeMs).find((item) => item.playerId === playerId);
}

describe('InterpolationBuffer', () => {
  it('posição correta entre dois snapshots', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(snapshot(1000, [player('b', 100, 200)]));
    buffer.push(snapshot(1050, [player('b', 110, 180)]));
    expect(at(buffer, 1000)).toMatchObject({ x: 100, y: 200 });
    expect(at(buffer, 1025)).toMatchObject({ x: 105, y: 190 });
    expect(at(buffer, 1040)).toMatchObject({ x: 108, y: 184 });
  });

  it('usa os dois snapshots vizinhos do instante desenhado', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(snapshot(1000, [player('b', 0, 0)]));
    buffer.push(snapshot(1050, [player('b', 50, 0)]));
    buffer.push(snapshot(1100, [player('b', 50, 100)]));
    expect(at(buffer, 1075)).toMatchObject({ x: 50, y: 50 });
  });

  it('gira a mira pelo menor arco', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(snapshot(1000, [player('b', 0, 0, Math.PI - 0.1)]));
    buffer.push(snapshot(1100, [player('b', 0, 0, -Math.PI + 0.1)]));
    const aim = at(buffer, 1050)?.aimAngle ?? 0;
    expect(Math.abs(Math.cos(aim) + 1)).toBeLessThan(1e-9);
  });

  it('sem snapshot novo, extrapola por no máximo 100 ms e depois para', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(snapshot(1000, [player('b', 100, 0)]));
    buffer.push(snapshot(1050, [player('b', 110, 0)]));
    // 10 px a cada 50 ms: 0,2 px/ms.
    expect(at(buffer, 1100)?.x).toBeCloseTo(120, 9);
    expect(at(buffer, 1050 + NET_CONFIG.maxExtrapolationMs)?.x).toBeCloseTo(130, 9);
    expect(at(buffer, 1400)?.x).toBeCloseTo(130, 9);
  });

  it('antes do primeiro snapshot, fica na primeira posição', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(snapshot(1000, [player('b', 7, 8)]));
    buffer.push(snapshot(1050, [player('b', 9, 8)]));
    expect(at(buffer, 500)).toMatchObject({ x: 7, y: 8 });
  });

  it('jogador que apareceu no snapshot mais novo entra na posição dele', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(snapshot(1000, [player('b', 0, 0)]));
    buffer.push(snapshot(1050, [player('b', 10, 0), player('c', 300, 300)]));
    expect(at(buffer, 1025, 'c')).toMatchObject({ x: 300, y: 300 });
  });

  it('ignora snapshot repetido ou fora de ordem', () => {
    const buffer = new InterpolationBuffer();
    buffer.push(snapshot(1050, [player('b', 10, 0)]));
    buffer.push(snapshot(1000, [player('b', 0, 0)]));
    buffer.push(snapshot(1050, [player('b', 99, 0)]));
    expect(buffer.size).toBe(1);
  });

  it('guarda só o último segundo de snapshots e conta a folga à frente', () => {
    const buffer = new InterpolationBuffer();
    for (let time = 0; time <= 3000; time += 50) {
      buffer.push(snapshot(time, [player('b', time, 0)]));
    }
    expect(buffer.size).toBeLessThanOrEqual(NET_CONFIG.interpolationBufferMs / 50 + 1);
    expect(buffer.aheadOf(2900)).toBe(2);
  });

  it('vazio, não desenha ninguém', () => {
    expect(new InterpolationBuffer().sample(1000)).toEqual([]);
  });
});
