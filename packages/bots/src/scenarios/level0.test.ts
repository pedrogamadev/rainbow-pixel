// Cenários do bot nível 0: situação montada -> comando esperado.

import {
  BOT_LEVEL0_CONFIG,
  SIM_CONFIG,
  TICK_SECONDS,
  createPlayerState,
  stepPlayer,
} from '@rainbow-pixel/shared';
import type { CollisionMap, PlayerSimState, Vec2 } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import type { BotIntent } from '../BotBrain.js';
import type { PlayerView } from '../PlayerView.js';
import { level0Brain } from '../levels/level0.js';
import { createBotMemory } from '../memory.js';
import { botView } from '../testing/views.js';
import type { BotMemory } from '../memory.js';

const DECISION_MS = 1000 / BOT_LEVEL0_CONFIG.decisionRateHz;

function view(self: Vec2, waypoints: readonly Vec2[], aimAngle = 0): PlayerView {
  return botView({ self: { x: self.x, y: self.y, aimAngle }, waypoints });
}

function decide(position: Vec2, waypoints: readonly Vec2[], memory: BotMemory): BotIntent {
  return level0Brain.decide(view(position, waypoints), memory, DECISION_MS);
}

function isStill(command: BotIntent): boolean {
  return command.moveX === 0 && command.moveY === 0;
}

const SQUARE: readonly Vec2[] = [
  { x: 100, y: 100 },
  { x: 400, y: 100 },
  { x: 400, y: 400 },
  { x: 100, y: 400 },
];

/** O movimento é relativo à mira: o bot anda para frente (W) mirando no destino. */
const FORWARD = { moveX: 0, moveY: -1 } as const;

function expectHeadingTo(command: BotIntent, from: Vec2, to: Vec2): void {
  expect(command).toMatchObject({ ...FORWARD, moveMode: 'walk' });
  expect(command.aimAngle).toBeCloseTo(Math.atan2(to.y - from.y, to.x - from.x), 9);
}

describe('bot nível 0: anda em direção ao waypoint', () => {
  it.each([
    ['leste', { x: 300, y: 100 }, 0],
    ['oeste', { x: -100, y: 100 }, Math.PI],
    ['sul', { x: 100, y: 300 }, Math.PI / 2],
    ['norte', { x: 100, y: -100 }, -Math.PI / 2],
    ['nordeste', { x: 300, y: -100 }, -Math.PI / 4],
    ['sudoeste', { x: -100, y: 300 }, (3 * Math.PI) / 4],
  ] as const)('waypoint a %s: mira nele e anda para frente', (_name, waypoint, aimAngle) => {
    const command = decide({ x: 100, y: 100 }, [waypoint], createBotMemory());
    expect(command).toMatchObject({ ...FORWARD, moveMode: 'walk' });
    expect(command.aimAngle).toBeCloseTo(aimAngle, 9);
  });

  it('mira na reta exata até o waypoint, sem arredondar para as 8 direções do teclado', () => {
    const from = { x: 100, y: 100 };
    const to = { x: 200, y: 160 };
    expectHeadingTo(decide(from, [to], createBotMemory()), from, to);
  });

  it('o movimento resultante vai na direção do waypoint', () => {
    const from = { x: 100, y: 100 };
    const command = decide(from, [{ x: 400, y: 250 }], createBotMemory());
    const state = createPlayerState({ playerId: 'bot:1', team: 0, ...from });
    const open: CollisionMap = {
      cellSize: SIM_CONFIG.cellSize,
      width: 100,
      height: 100,
      isSolid: () => false,
    };
    const next = stepPlayer(open, state, command, TICK_SECONDS);
    expect(Math.atan2(next.y - from.y, next.x - from.x)).toBeCloseTo(Math.atan2(150, 300), 9);
  });

  it('começa pelo waypoint mais perto', () => {
    const memory = createBotMemory();
    const from = { x: 390, y: 380 };
    const command = decide(from, SQUARE, memory);
    expect(memory.waypointIndex).toBe(2);
    expectHeadingTo(command, from, { x: 400, y: 400 });
  });

  it('devolve uma intenção sem seq: quem numera é o servidor', () => {
    const intent = decide({ x: 0, y: 0 }, SQUARE, createBotMemory());
    expect(intent).not.toHaveProperty('seq');
  });
});

describe('bot nível 0: avança ao chegar', () => {
  it('para 1 s no waypoint e depois segue para o próximo', () => {
    const memory = createBotMemory();
    const atFirst = { x: 101, y: 102 };
    const commands = Array.from({ length: BOT_LEVEL0_CONFIG.waypointPauseMs / DECISION_MS }, () =>
      decide(atFirst, SQUARE, memory),
    );
    expect(commands.every(isStill)).toBe(true);

    const next = decide(atFirst, SQUARE, memory);
    expect(memory.waypointIndex).toBe(1);
    expectHeadingTo(next, atFirst, { x: 400, y: 100 });
  });

  it('parado, mantém a mira do último movimento', () => {
    const memory = createBotMemory();
    decide({ x: 100, y: 130 }, SQUARE, memory);
    const still = decide({ x: 100, y: 101 }, SQUARE, memory);
    expect(isStill(still)).toBe(true);
    expect(still.aimAngle).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('depois do último waypoint, volta ao primeiro', () => {
    const memory = createBotMemory();
    memory.waypointIndex = 3;
    const atLast = { x: 100, y: 400 };
    for (
      let decision = 0;
      decision <= BOT_LEVEL0_CONFIG.waypointPauseMs / DECISION_MS;
      decision += 1
    ) {
      decide(atLast, SQUARE, memory);
    }
    expect(memory.waypointIndex).toBe(0);
  });
});

describe('bot nível 0: pula waypoint quando preso', () => {
  it('sem chegar mais perto por 2 s, vai para o próximo waypoint', () => {
    const memory = createBotMemory();
    // Encostado numa parede: a posição não muda, por mais que ele tente andar.
    const stuck = { x: 250, y: 100 };
    const decisions = BOT_LEVEL0_CONFIG.stuckTimeoutMs / DECISION_MS;
    memory.waypointIndex = 1;
    for (let decision = 0; decision < decisions; decision += 1) {
      expect(memory.waypointIndex).toBe(1);
      decide(stuck, SQUARE, memory);
    }
    const after = decide(stuck, SQUARE, memory);
    expect(memory.waypointIndex).toBe(2);
    expectHeadingTo(after, stuck, { x: 400, y: 400 });
  });

  it('chegando mais perto, não desiste', () => {
    const memory = createBotMemory();
    memory.waypointIndex = 1;
    for (let decision = 0; decision < 30; decision += 1) {
      decide({ x: 110 + decision * 5, y: 100 }, SQUARE, memory);
    }
    expect(memory.waypointIndex).toBe(1);
  });
});

describe('bot nível 0: sem waypoints', () => {
  it('fica parado, com a mira do spawn', () => {
    const memory = createBotMemory();
    for (let decision = 0; decision < 50; decision += 1) {
      const command = level0Brain.decide(view({ x: 10, y: 10 }, [], 1.5), memory, DECISION_MS);
      expect(command).toMatchObject({ moveX: 0, moveY: 0, aimAngle: 1.5 });
    }
  });
});

describe('bot nível 0 andando de verdade', () => {
  const open: CollisionMap = {
    cellSize: SIM_CONFIG.cellSize,
    width: 100,
    height: 100,
    isSolid: (cx, cy) => cx < 0 || cy < 0 || cx >= 100 || cy >= 100,
  };

  it('percorre o circuito na ordem, repetindo o input entre as decisões', () => {
    const memory = createBotMemory();
    let state: PlayerSimState = createPlayerState({ playerId: 'bot:1', team: 0, x: 60, y: 60 });
    const ticksPerDecision = SIM_CONFIG.tickRate / BOT_LEVEL0_CONFIG.decisionRateHz;
    const visits: number[] = [];
    let command: BotIntent | null = null;
    for (let tick = 0; tick < SIM_CONFIG.tickRate * 40; tick += 1) {
      if (tick % ticksPerDecision === 0) {
        command = level0Brain.decide(view(state, SQUARE, state.aimAngle), memory, DECISION_MS);
        if (memory.pauseLeftMs === BOT_LEVEL0_CONFIG.waypointPauseMs) {
          visits.push(memory.waypointIndex ?? -1);
        }
      }
      if (command !== null) {
        state = stepPlayer(open, state, command, TICK_SECONDS);
      }
    }
    expect(visits.slice(0, 6)).toEqual([0, 1, 2, 3, 0, 1]);
  });
});
