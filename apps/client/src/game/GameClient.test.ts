import { ClientMessageType, NET_CONFIG, ServerMessageType, TICK_MS } from '@rainbow-pixel/shared';
import type { InputMessage, MoveInput, SnapshotMessage } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import { GameClient } from './GameClient.js';
import type { GameTransport } from './GameClient.js';
import { openMap } from './testing/fakeServer.js';

class FakeTransport implements GameTransport {
  readonly sent: { type: string; payload: unknown }[] = [];
  private readonly handlers = new Map<string, Set<(payload: unknown) => void>>();

  send(type: string, payload: unknown): void {
    this.sent.push({ type, payload });
  }

  onMessage(type: string, handler: (payload: unknown) => void): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
    return () => set.delete(handler);
  }

  emit(type: string, payload: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) handler(payload);
  }

  inputs(): InputMessage[] {
    return this.sent
      .filter((item) => item.type === ClientMessageType.Input)
      .map((item) => item.payload as InputMessage);
  }
}

const WALK_RIGHT: MoveInput = { moveX: 1, moveY: 0, aimAngle: 0, moveMode: 'walk' };

function setup() {
  let now = 0;
  const transport = new FakeTransport();
  const client = new GameClient({ transport, map: openMap, selfId: 'eu', now: () => now });
  return {
    transport,
    client,
    advance(ms: number) {
      now += ms;
    },
    get now() {
      return now;
    },
  };
}

function snapshot(
  serverTimeMs: number,
  ackSeq: number,
  others: { x: number }[] = [],
): SnapshotMessage {
  return {
    tick: Math.round(serverTimeMs / TICK_MS),
    serverTimeMs,
    ackSeq,
    players: [
      { playerId: 'eu', team: 0, x: 500, y: 500, aimAngle: 0, moveMode: 'walk', connected: true },
      ...others.map((other, index) => ({
        playerId: `outro${index}`,
        team: 1 as const,
        x: other.x,
        y: 100,
        aimAngle: 0,
        moveMode: 'walk' as const,
        connected: true,
      })),
    ],
  };
}

describe('GameClient', () => {
  it('amostra um input por tick de 30 Hz, com seq crescente', () => {
    const test = setup();
    test.client.update(() => WALK_RIGHT);
    for (let frame = 0; frame < 60; frame += 1) {
      test.advance(1000 / 60);
      test.client.update(() => WALK_RIGHT);
    }
    const inputs = test.transport.inputs();
    expect(inputs).toHaveLength(30);
    expect(inputs.map((message) => message.inputs.at(-1)?.seq)).toEqual(
      Array.from({ length: 30 }, (_value, index) => index + 1),
    );
  });

  it('cada mensagem leva até os 3 últimos inputs ainda não confirmados', () => {
    const test = setup();
    test.client.update(() => WALK_RIGHT);
    for (let tick = 0; tick < 5; tick += 1) {
      test.advance(TICK_MS);
      test.client.update(() => WALK_RIGHT);
    }
    const seqs = test.transport.inputs().map((message) => message.inputs.map((input) => input.seq));
    expect(seqs).toEqual([[1], [1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5]]);

    // Confirmados até o 4: a próxima mensagem leva só os pendentes.
    test.transport.emit(ServerMessageType.Snapshot, snapshot(0, 4));
    test.advance(TICK_MS);
    test.client.update(() => WALK_RIGHT);
    expect(
      test.transport
        .inputs()
        .at(-1)
        ?.inputs.map((input) => input.seq),
    ).toEqual([5, 6]);
    expect(test.client.stats().pendingInputs).toBe(2);
  });

  it('manda ping a cada 1 s e mede o RTT pelo pong', () => {
    const test = setup();
    // Quadros de 0 a 3,1 s: pings em 0, 1, 2 e 3 s.
    for (let frame = 0; frame <= 186; frame += 1) {
      test.client.update(() => WALK_RIGHT);
      test.advance(1000 / 60);
    }
    const pings = test.transport.sent.filter((item) => item.type === ClientMessageType.Ping);
    expect(pings).toHaveLength(4);
    test.transport.emit(ServerMessageType.Pong, { clientTimeMs: test.now - 80, serverTimeMs: 1 });
    expect(test.client.stats().rttMs).toBe(80);
  });

  it('depois de muito tempo sem quadro, não manda uma rajada de inputs', () => {
    const test = setup();
    test.client.update(() => WALK_RIGHT);
    test.advance(5000);
    test.client.update(() => WALK_RIGHT);
    expect(test.transport.inputs()).toHaveLength(NET_CONFIG.clientMaxCatchUpTicks);
  });

  it('desenha os outros interpolados 100 ms no passado, sem incluir o próprio jogador', () => {
    const test = setup();
    test.transport.emit(ServerMessageType.Snapshot, snapshot(10_000, 0, [{ x: 100 }]));
    test.advance(50);
    test.transport.emit(ServerMessageType.Snapshot, snapshot(10_050, 0, [{ x: 110 }]));
    // Relógio pelo primeiro snapshot: agora o servidor está em 10.050; desenha em 9.950.
    expect(test.client.renderOthers()).toEqual([
      expect.objectContaining({ playerId: 'outro0', x: 100 }),
    ]);
    // Agora em 125 ms: o servidor está em 10.125 e o desenho, no meio dos dois snapshots.
    test.advance(75);
    expect(test.client.renderOthers()[0]?.x).toBeCloseTo(105, 9);
    expect(test.client.renderSelf()).toMatchObject({ playerId: 'eu', x: 500, y: 500 });
  });

  it('conta as correções do último segundo', () => {
    const test = setup();
    const seen: number[] = [];
    test.client.onCorrection((correction) => seen.push(correction.errorPx));
    test.transport.emit(ServerMessageType.Snapshot, snapshot(0, 0));
    test.transport.emit(ServerMessageType.Snapshot, {
      ...snapshot(50, 0),
      players: [
        { playerId: 'eu', team: 0, x: 510, y: 500, aimAngle: 0, moveMode: 'walk', connected: true },
      ],
    });
    expect(seen).toEqual([10]);
    expect(test.client.stats()).toMatchObject({ correctionsPerSecond: 1, lastCorrectionPx: 10 });
    test.advance(1500);
    expect(test.client.stats().correctionsPerSecond).toBe(0);
  });

  it('ao reconectar, volta a numerar os inputs a partir de 1', () => {
    const test = setup();
    test.client.update(() => WALK_RIGHT);
    test.advance(TICK_MS * 3);
    test.client.update(() => WALK_RIGHT);
    test.client.resetInputs();
    test.advance(TICK_MS);
    test.client.update(() => WALK_RIGHT);
    expect(
      test.transport
        .inputs()
        .at(-1)
        ?.inputs.map((input) => input.seq),
    ).toEqual([1]);
  });

  it('dispose para de ouvir as mensagens', () => {
    const test = setup();
    test.client.dispose();
    test.transport.emit(ServerMessageType.Snapshot, snapshot(0, 0));
    expect(test.client.stats().snapshotsReceived).toBe(0);
  });
});
