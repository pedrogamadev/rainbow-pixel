import {
  ClientMessageType,
  NET_CONFIG,
  ServerMessageType,
  TICK_MS,
  createWeaponState,
} from '@rainbow-pixel/shared';
import type {
  InputMessage,
  MatchEvent,
  PlayerInput,
  SnapshotMessage,
  SnapshotPlayer,
} from '@rainbow-pixel/shared';
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

const WALK_RIGHT: PlayerInput = {
  moveX: 1,
  moveY: 0,
  aimAngle: 0,
  moveMode: 'walk',
  fire: false,
  reload: false,
  weaponSlot: 'primary',
};

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

function snapshotPlayer(playerId: string, x: number, y: number, team: 0 | 1): SnapshotPlayer {
  return {
    playerId,
    team,
    x,
    y,
    aimAngle: 0,
    moveMode: 'walk',
    connected: true,
    alive: true,
    activeSlot: 'primary',
  };
}

function snapshot(
  serverTimeMs: number,
  ackSeq: number,
  others: { x: number; y?: number }[] = [],
  events: MatchEvent[] = [],
  selfX = 500,
): SnapshotMessage {
  return {
    tick: Math.round(serverTimeMs / TICK_MS),
    serverTimeMs,
    ackSeq,
    self: {
      x: selfX,
      y: 500,
      aimAngle: 0,
      moveMode: 'walk',
      health: 100,
      alive: true,
      respawnInMs: null,
      weapon: createWeaponState(),
      dev: { god: false, noSpread: false },
    },
    players: [
      snapshotPlayer('eu', selfX, 500, 0),
      ...others.map((other, index) => snapshotPlayer(`outro${index}`, other.x, other.y ?? 100, 1)),
    ],
    events,
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
    test.transport.emit(ServerMessageType.Snapshot, snapshot(50, 0, [], [], 510));
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

  it('cada input leva viewTimeMs igual ao instante que a interpolação desenha', () => {
    const test = setup();
    test.transport.emit(ServerMessageType.Snapshot, snapshot(10_000, 0, [{ x: 100 }]));
    test.advance(50);
    test.transport.emit(ServerMessageType.Snapshot, snapshot(10_050, 0, [{ x: 110 }]));
    test.advance(75);
    test.client.update(() => WALK_RIGHT);
    test.advance(TICK_MS);
    test.client.update(() => WALK_RIGHT);
    const input = test.transport.inputs().at(-1)?.inputs.at(-1);
    // O relógio pelo primeiro snapshot: o servidor está em 10.158; desenha em 10.058, que passa
    // do último snapshot (10.050) e fica na extrapolação.
    expect(input?.viewTimeMs).toBeCloseTo(10_050 + 125 + TICK_MS - 50 - 100, 6);
    expect(input?.viewTimeMs).toBe(test.client.drawnTime());
  });

  it('a extrapolação limita o viewTimeMs a 100 ms depois do último snapshot', () => {
    const test = setup();
    test.transport.emit(ServerMessageType.Snapshot, snapshot(10_000, 0, [{ x: 100 }]));
    test.advance(5000);
    expect(test.client.drawnTime()).toBe(10_000 + NET_CONFIG.maxExtrapolationMs);
  });

  it('descarta os eventos repetidos dos snapshots seguintes', () => {
    const test = setup();
    const seen: number[] = [];
    test.client.onEvent((event) => seen.push(event.eventId));
    const kill: MatchEvent = {
      kind: 'kill',
      eventId: 7,
      tick: 1,
      killerId: 'outro0',
      victimId: 'eu',
      weaponId: 'm4a1',
    };
    const shot: MatchEvent = {
      kind: 'shot',
      eventId: 8,
      tick: 2,
      shooterId: 'outro0',
      weaponId: 'm4a1',
      origin: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    };
    test.transport.emit(ServerMessageType.Snapshot, snapshot(0, 0, [], [kill]));
    test.transport.emit(ServerMessageType.Snapshot, snapshot(50, 0, [], [kill, shot]));
    test.transport.emit(ServerMessageType.Snapshot, snapshot(100, 0, [], [kill, shot]));
    expect(seen).toEqual([7, 8]);
  });

  it('conta disparos, acertos previstos pelo raio local e acertos confirmados pelo seq', () => {
    const test = setup();
    // Outro jogador parado bem na frente (leste), na mesma altura.
    test.transport.emit(ServerMessageType.Snapshot, snapshot(10_000, 0, [{ x: 700, y: 500 }]));
    test.advance(50);
    test.transport.emit(ServerMessageType.Snapshot, snapshot(10_050, 0, [{ x: 700, y: 500 }]));
    const shots: (string | null)[] = [];
    test.client.onLocalShot((shot) => shots.push(shot.localTargetId));
    const fire: PlayerInput = { ...WALK_RIGHT, moveX: 0, fire: true };
    test.client.update(() => fire);
    test.advance(TICK_MS);
    test.client.update(() => fire);
    expect(shots).toEqual(['outro0']);
    const seq =
      test.transport
        .inputs()
        .at(-1)
        ?.inputs.find((input) => input.fire)?.seq ?? 0;
    const confirm: MatchEvent = {
      kind: 'hit_confirm',
      eventId: 1,
      tick: 3,
      seq,
      targetId: 'outro0',
      damage: 32,
      killed: false,
    };
    test.transport.emit(
      ServerMessageType.Snapshot,
      snapshot(10_100, seq, [{ x: 700, y: 500 }], [confirm]),
    );
    // Repetido no snapshot seguinte: não conta de novo.
    test.transport.emit(
      ServerMessageType.Snapshot,
      snapshot(10_150, seq, [{ x: 700, y: 500 }], [confirm]),
    );
    expect(test.client.shotStats()).toMatchObject({
      shotsFired: 1,
      localHits: 1,
      confirmedHits: 1,
      hitRegRatio: 1,
    });
  });

  it('tiro previsto na parede não conta como acerto local', () => {
    const test = setup();
    test.transport.emit(ServerMessageType.Snapshot, snapshot(10_000, 0, [{ x: 700, y: 100 }]));
    const shots: (string | null)[] = [];
    test.client.onLocalShot((shot) => shots.push(shot.localTargetId));
    test.client.update(() => ({ ...WALK_RIGHT, moveX: 0, fire: true }));
    test.advance(TICK_MS);
    test.client.update(() => ({ ...WALK_RIGHT, moveX: 0, fire: true }));
    expect(shots).toEqual([null]);
    expect(test.client.shotStats()).toMatchObject({
      shotsFired: 1,
      localHits: 0,
      hitRegRatio: null,
    });
  });

  it('prevê a munição gasta antes da confirmação do servidor', () => {
    const test = setup();
    test.transport.emit(ServerMessageType.Snapshot, snapshot(0, 0));
    test.client.update(() => ({ ...WALK_RIGHT, fire: true }));
    test.advance(TICK_MS);
    test.client.update(() => ({ ...WALK_RIGHT, fire: true }));
    expect(test.client.predictedSelf()?.weapon.ammo.primary).toBe(29);
    expect(test.client.aimSpread()?.recoilDeg).toBeCloseTo(1.2, 9);
  });

  it('dispose para de ouvir as mensagens', () => {
    const test = setup();
    test.client.dispose();
    test.transport.emit(ServerMessageType.Snapshot, snapshot(0, 0));
    expect(test.client.stats().snapshotsReceived).toBe(0);
  });
});
