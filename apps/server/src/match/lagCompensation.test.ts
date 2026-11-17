import {
  LAG_COMP_CONFIG,
  TICK_MS,
  createPlayerState,
  createWorld,
  stepWorld,
} from '@rainbow-pixel/shared';
import type { PlayerInput, SimWorld, WorldInput } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import {
  compensatedTargets,
  recordFrame,
  rewindTargetMs,
  sampleHistory,
} from './lagCompensation.js';
import type { HistoryFrame, PositionHistory } from './lagCompensation.js';

function frame(tick: number, players: Record<string, [number, number, boolean?]>): HistoryFrame {
  return {
    tick,
    timeMs: tick * TICK_MS,
    players: new Map(
      Object.entries(players).map(([id, [x, y, alive]]) => [id, { x, y, alive: alive ?? true }]),
    ),
  };
}

describe('recordFrame', () => {
  it('guarda só os últimos 300 ms', () => {
    let history: PositionHistory = [];
    for (let tick = 0; tick < 30; tick += 1) {
      history = recordFrame(history, frame(tick, { a: [tick, 0] }));
    }
    const span = (history.at(-1)?.timeMs ?? 0) - (history[0]?.timeMs ?? 0);
    expect(span).toBeLessThanOrEqual(LAG_COMP_CONFIG.historyMs);
    expect(span).toBeGreaterThanOrEqual(LAG_COMP_CONFIG.historyMs - TICK_MS);
  });
});

describe('rewindTargetMs', () => {
  it('usa o instante que o cliente via, dentro do limite', () => {
    expect(rewindTargetMs(900, 1000, 1010)).toBe(900);
  });

  it('volta no máximo 200 ms a partir da chegada do input', () => {
    expect(rewindTargetMs(500, 1000, 1010)).toBe(1000 - LAG_COMP_CONFIG.maxRewindMs);
  });

  it('a espera na fila não come o limite: conta da chegada, não do tick', () => {
    // Chegou em 1000, processado em 1100: o cliente via 820 (180 ms antes da chegada).
    expect(rewindTargetMs(820, 1000, 1100)).toBe(820);
  });

  it('não vai para o futuro', () => {
    expect(rewindTargetMs(2000, 1000, 1010)).toBe(1010);
  });
});

describe('sampleHistory', () => {
  const history = [frame(0, { a: [0, 0] }), frame(1, { a: [10, 20] }), frame(2, { a: [20, 40] })];

  it('interpola entre os dois ticks vizinhos', () => {
    expect(sampleHistory(history, TICK_MS * 0.5).get('a')).toEqual({ x: 5, y: 10 });
    expect(sampleHistory(history, TICK_MS * 1.25).get('a')?.x).toBeCloseTo(12.5, 9);
  });

  it('fora do histórico, usa a ponta mais perto', () => {
    expect(sampleHistory(history, -500).get('a')).toEqual({ x: 0, y: 0 });
    expect(sampleHistory(history, 5000).get('a')).toEqual({ x: 20, y: 40 });
  });

  it('quem não estava vivo nos dois ticks vizinhos fica de fora', () => {
    const died = [frame(0, { a: [0, 0] }), frame(1, { a: [0, 0, false] })];
    expect(sampleHistory(died, TICK_MS * 0.5).has('a')).toBe(false);
    expect(sampleHistory(died, 0).has('a')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Critério 3: o mesmo cenário acerta com a compensação e erra sem ela.
// ---------------------------------------------------------------------------

/** Mapa aberto de 2000 x 2000 px. */
const OPEN = {
  cellSize: 8,
  width: 250,
  height: 250,
  isSolid: (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= 250 || cy >= 250,
};

const STAND: PlayerInput = {
  moveX: 0,
  moveY: 0,
  aimAngle: 0,
  moveMode: 'walk',
  fire: false,
  reload: false,
  weaponSlot: 'primary',
};

/** Mira para baixo e anda para frente (W): 140 px/s para baixo. */
const WALK_DOWN: PlayerInput = { ...STAND, aimAngle: Math.PI / 2, moveY: -1 };

interface Scenario {
  readonly world: SimWorld;
  readonly history: PositionHistory;
  /** Onde o alvo estava `rewindMs` atrás. */
  readonly seen: { readonly x: number; readonly y: number };
  readonly tickTimeMs: number;
}

/**
 * Alvo andando a 140 px/s para baixo, perpendicular à linha de tiro, por 1 s; o atirador parado
 * a 300 px, com o histórico do servidor guardado tick a tick.
 */
function movingTarget(rewindMs: number): Scenario {
  let world = createWorld(OPEN, [
    createPlayerState({ playerId: 'atirador', team: 0, x: 500, y: 1000 }),
    createPlayerState({ playerId: 'alvo', team: 1, x: 800, y: 900 }),
  ]);
  let history: PositionHistory = [];
  const walkDown: WorldInput = { input: WALK_DOWN };
  for (let tick = 1; tick <= 30; tick += 1) {
    world = stepWorld(world, new Map([['alvo', walkDown]])).world;
    history = recordFrame(history, {
      tick,
      timeMs: tick * TICK_MS,
      players: new Map(
        world.players.map((player) => [player.playerId, { x: player.x, y: player.y, alive: true }]),
      ),
    });
  }
  // O próximo tick (31) é o do disparo; o alvo ainda anda nele.
  const tickTimeMs = 31 * TICK_MS;
  // Andando a 140 px/s desde y = 900 no instante 0.
  const seenY = 900 + (140 * (tickTimeMs - rewindMs)) / 1000;
  return { world, history, seen: { x: 800, y: seenY }, tickTimeMs };
}

/** O atirador mira onde viu o alvo e dispara. `maxRewindMs` 0 é o servidor sem compensação. */
function shootAtSeen(scenario: Scenario, viewTimeMs: number, maxRewindMs: number) {
  const atirador = scenario.world.players.find((player) => player.playerId === 'atirador');
  const aimAngle = Math.atan2(scenario.seen.y - (atirador?.y ?? 0), scenario.seen.x - 500);
  const inputs = new Map<string, WorldInput>([
    ['atirador', { input: { ...STAND, aimAngle, fire: true } }],
    ['alvo', { input: WALK_DOWN }],
  ]);
  const receivedAtMs = scenario.tickTimeMs;
  return stepWorld(scenario.world, inputs, {
    seed: 1,
    hasNoSpread: () => true,
    targetsForShot: (_shot, current) => {
      const timeMs = rewindTargetMs(viewTimeMs, receivedAtMs, scenario.tickTimeMs, maxRewindMs);
      return compensatedTargets(scenario.history, timeMs, current, scenario.tickTimeMs);
    },
  }).shots[0];
}

describe('compensação de lag (critério 3)', () => {
  it('alvo a 140 px/s e atirador vendo o passado em 175 ms: acerta com a compensação', () => {
    const scenario = movingTarget(175);
    const shot = shootAtSeen(scenario, scenario.tickTimeMs - 175, LAG_COMP_CONFIG.maxRewindMs);
    expect(shot?.hit?.targetId).toBe('alvo');
  });

  it('o mesmo cenário com volta zero erra: o alvo já andou 24,5 px', () => {
    const scenario = movingTarget(175);
    const shot = shootAtSeen(scenario, scenario.tickTimeMs - 175, 0);
    expect(shot?.hit).toBeNull();
  });

  it('a volta é limitada a 200 ms: vendo 400 ms atrás, o servidor mede 200 ms atrás', () => {
    const scenario = movingTarget(400);
    const shot = shootAtSeen(scenario, scenario.tickTimeMs - 400, LAG_COMP_CONFIG.maxRewindMs);
    expect(shot?.hit).toBeNull();
    // Mirando onde o alvo estava 200 ms atrás, acerta.
    const limited = movingTarget(LAG_COMP_CONFIG.maxRewindMs);
    const atLimit = shootAtSeen(limited, limited.tickTimeMs - 400, LAG_COMP_CONFIG.maxRewindMs);
    expect(atLimit?.hit?.targetId).toBe('alvo');
  });

  it('alvo já morto no servidor não recebe dano, mesmo vivo no passado', () => {
    const scenario = movingTarget(175);
    const dead: SimWorld = {
      ...scenario.world,
      players: scenario.world.players.map((player) =>
        player.playerId === 'alvo'
          ? { ...player, alive: false, health: 0, respawnAtTick: 999 }
          : player,
      ),
    };
    const shot = shootAtSeen(
      { ...scenario, world: dead },
      scenario.tickTimeMs - 175,
      LAG_COMP_CONFIG.maxRewindMs,
    );
    expect(shot?.hit).toBeNull();
  });
});
