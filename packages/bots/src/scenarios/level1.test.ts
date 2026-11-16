// Cenários do bot nível 1: situação montada -> comando esperado.

import {
  BOT_DIFFICULTY_PARAMS,
  BOT_LEVEL0_CONFIG,
  BOT_LEVEL1_CONFIG,
  SIM_CONFIG,
  TICK_MS,
  VISION_CONFIG,
} from '@rainbow-pixel/shared';
import type { BotDifficultyId, BotDifficultyParams } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import type { BotIntent } from '../BotBrain.js';
import type { PlayerView, PlayerViewOther, PlayerViewSelf } from '../PlayerView.js';
import { angleDifference, turnTowards } from '../aim.js';
import { createLevel1Brain } from '../levels/level1.js';
import { createBotMemory } from '../memory.js';
import type { BotMemory } from '../memory.js';
import { canSee, visibleEnemies } from '../perception.js';
import { ally, botView, enemy, mapWith } from '../testing/views.js';

const DECISION_MS = 1000 / BOT_LEVEL0_CONFIG.decisionRateHz;
const TICKS_PER_DECISION = SIM_CONFIG.tickRate / BOT_LEVEL0_CONFIG.decisionRateHz;
const HARD = createLevel1Brain(BOT_DIFFICULTY_PARAMS.hard);
const MEDIUM = createLevel1Brain(BOT_DIFFICULTY_PARAMS.medium);
const SEED = 1234;

interface Run {
  readonly intents: BotIntent[];
  readonly memory: BotMemory;
}

/**
 * Roda `decisions` decisões seguidas. A mira do bot na visão segue a intenção anterior, como
 * no servidor. `scene` monta a visão de cada decisão (para mexer no alvo ou na munição).
 */
function run(
  brain: ReturnType<typeof createLevel1Brain>,
  decisions: number,
  scene: (decision: number, self: Partial<PlayerViewSelf>) => PlayerView,
  memory: BotMemory = createBotMemory(SEED),
): Run {
  const intents: BotIntent[] = [];
  let aimAngle = 0;
  for (let decision = 0; decision < decisions; decision += 1) {
    const view = scene(decision, { aimAngle });
    const intent = brain.decide(
      { ...view, tick: decision * TICKS_PER_DECISION },
      memory,
      DECISION_MS,
    );
    intents.push(intent);
    aimAngle = intent.aimAngle;
  }
  return { intents, memory };
}

/** Cena fixa: o bot em (1000, 1000) e os outros jogadores dados. */
function fixed(others: readonly PlayerViewOther[], extra: Parameters<typeof botView>[0] = {}) {
  return (_decision: number, self: Partial<PlayerViewSelf>) =>
    botView({ ...extra, self: { ...self, ...extra.self }, others });
}

function fired(run: Run): number[] {
  return run.intents.flatMap((intent, index) => (intent.fire ? [index] : []));
}

describe('percepção', () => {
  it('vê o inimigo no cone até 900 px e não além', () => {
    const view = botView();
    expect(canSee(view, enemy('e', 1000 + VISION_CONFIG.rangePx - 1, 1000))).toBe(true);
    expect(canSee(view, enemy('e', 1000 + VISION_CONFIG.rangePx + 1, 1000))).toBe(false);
  });

  it('não vê fora do cone de 100°', () => {
    const view = botView();
    const inside = ((VISION_CONFIG.coneDeg / 2 - 1) * Math.PI) / 180;
    const outside = ((VISION_CONFIG.coneDeg / 2 + 1) * Math.PI) / 180;
    expect(
      canSee(view, enemy('e', 1000 + 300 * Math.cos(inside), 1000 + 300 * Math.sin(inside))),
    ).toBe(true);
    expect(
      canSee(view, enemy('e', 1000 + 300 * Math.cos(outside), 1000 + 300 * Math.sin(outside))),
    ).toBe(false);
    expect(canSee(view, enemy('e', 700, 1000))).toBe(false);
  });

  it('vê em qualquer direção dentro dos 48 px de periferia', () => {
    const view = botView();
    expect(canSee(view, enemy('e', 1000 - VISION_CONFIG.peripheralPx, 1000))).toBe(true);
    expect(canSee(view, enemy('e', 1000, 1000 + VISION_CONFIG.peripheralPx))).toBe(true);
    expect(canSee(view, enemy('e', 1000 - VISION_CONFIG.peripheralPx - 1, 1000))).toBe(false);
  });

  it('parede no caminho bloqueia a visão', () => {
    const view = botView({ map: mapWith((cx) => cx === 150) });
    expect(canSee(view, enemy('e', 1300, 1000))).toBe(false);
    expect(canSee(view, enemy('e', 1150, 1000))).toBe(true);
  });

  it('só inimigos vivos, do mais perto ao mais longe', () => {
    const view = botView({
      others: [
        enemy('longe', 1500, 1000),
        enemy('morto', 1100, 1000, { alive: false }),
        ally('aliado', 1050, 1000),
        enemy('perto', 1200, 1000),
      ],
    });
    expect(visibleEnemies(view).map((other) => other.playerId)).toEqual(['perto', 'longe']);
  });
});

describe('mira', () => {
  it('gira pelo menor arco, no máximo o passo dado', () => {
    expect(turnTowards(0, 1, 0.25)).toBeCloseTo(0.25, 12);
    expect(turnTowards(0, 0.1, 0.25)).toBeCloseTo(0.1, 12);
    expect(turnTowards(3, -3, 0.1)).toBeCloseTo(3.1, 12);
    expect(angleDifference(3, -3)).toBeCloseTo(2 * Math.PI - 6, 12);
  });
});

describe('bot nível 1: só atira em quem vê', () => {
  it('não dispara em alvo atrás de parede', () => {
    const map = mapWith((cx) => cx === 150);
    const result = run(HARD, 60, fixed([enemy('e', 1300, 1000)], { map }));
    expect(fired(result)).toEqual([]);
  });

  it('não dispara em alvo fora do cone nem além de 900 px', () => {
    const behind = run(HARD, 60, fixed([enemy('e', 700, 1000)]));
    expect(fired(behind)).toEqual([]);
    const far = run(HARD, 60, fixed([enemy('e', 1000 + VISION_CONFIG.rangePx + 50, 1000)]));
    expect(fired(far)).toEqual([]);
  });

  it('reage a quem está nas costas dentro da periferia de 48 px', () => {
    const result = run(HARD, 30, fixed([enemy('e', 960, 1000)]));
    expect(fired(result).length).toBeGreaterThan(0);
    // Vira para trás antes de atirar.
    const shot = result.intents[fired(result)[0] ?? 0];
    expect(Math.abs(angleDifference(shot?.aimAngle ?? 0, Math.PI))).toBeLessThan(
      ((BOT_DIFFICULTY_PARAMS.hard.aimErrorDeg + BOT_LEVEL1_CONFIG.fireToleranceDeg) * Math.PI) /
        180,
    );
  });

  it('para de andar quando vê um inimigo', () => {
    const waypoints = [{ x: 1500, y: 1000 }];
    const result = run(HARD, 5, fixed([enemy('e', 1400, 1100)], { waypoints }));
    expect(result.intents.every((intent) => intent.moveX === 0 && intent.moveY === 0)).toBe(true);
  });
});

describe('bot nível 1: reação e giro por dificuldade', () => {
  it.each(['easy', 'medium', 'hard'] as const)(
    '%s: o primeiro disparo nunca sai antes do tempo de reação',
    (difficulty: BotDifficultyId) => {
      const params = BOT_DIFFICULTY_PARAMS[difficulty];
      // Alvo bem na frente: a mira já está alinhada, só falta reagir.
      for (let seed = 0; seed < 20; seed += 1) {
        const result = run(
          createLevel1Brain({ ...params, aimErrorDeg: 0 }),
          30,
          fixed([enemy('e', 1400, 1000)]),
          createBotMemory(seed),
        );
        const first = fired(result)[0];
        expect(first).toBeDefined();
        const firstMs = (first ?? 0) * TICKS_PER_DECISION * TICK_MS;
        expect(firstMs).toBeGreaterThanOrEqual(params.reactionMs);
        expect(firstMs).toBeLessThan(params.reactionMs + DECISION_MS + 1e-6);
      }
    },
  );

  it.each(['easy', 'medium', 'hard'] as const)(
    '%s: respeita a velocidade de giro',
    (difficulty: BotDifficultyId) => {
      const params: BotDifficultyParams = BOT_DIFFICULTY_PARAMS[difficulty];
      // Alvo a 90° para cima (dentro do cone? não: periferia), a mira começa no leste.
      const result = run(createLevel1Brain(params), 20, fixed([enemy('e', 1000, 960)]));
      const maxStep = ((params.turnSpeedDegPerSec * DECISION_MS) / 1000) * (Math.PI / 180);
      let previous = 0;
      for (const intent of result.intents) {
        expect(Math.abs(angleDifference(previous, intent.aimAngle))).toBeLessThanOrEqual(
          maxStep + 1e-9,
        );
        previous = intent.aimAngle;
      }
      // E chega lá.
      expect(Math.abs(angleDifference(previous, -Math.PI / 2))).toBeLessThan(
        ((params.aimErrorDeg + 0.01) * Math.PI) / 180,
      );
    },
  );

  it('o erro de mira fica dentro de ±aimErrorDeg e se repete com a mesma seed', () => {
    const params = BOT_DIFFICULTY_PARAMS.easy;
    const errors = (seed: number) =>
      Array.from({ length: 50 }, (_v, index) => {
        const memory = createBotMemory(seed + index);
        run(createLevel1Brain(params), 1, fixed([enemy('e', 1400, 1000)]), memory);
        return memory.aimErrorDeg;
      });
    const first = errors(10);
    expect(errors(10)).toEqual(first);
    expect(first.every((error) => Math.abs(error) <= params.aimErrorDeg)).toBe(true);
    expect(new Set(first).size).toBeGreaterThan(40);
  });
});

describe('bot nível 1: rajada', () => {
  /** Cena em que cada intenção com fire tira `perShot` balas do pente. */
  function shootingScene(perShot: number) {
    let ammo = 30;
    return (decision: number, self: Partial<PlayerViewSelf>, lastFire: boolean) => {
      if (decision > 0 && lastFire) ammo = Math.max(0, ammo - perShot);
      return botView({ self: { ...self, ammo }, others: [enemy('e', 1400, 1000)] });
    };
  }

  function runShooting(params: BotDifficultyParams, decisions: number) {
    const brain = createLevel1Brain({ ...params, aimErrorDeg: 0 });
    const memory = createBotMemory(SEED);
    const scene = shootingScene(1);
    const intents: BotIntent[] = [];
    let aimAngle = 0;
    let lastFire = false;
    for (let decision = 0; decision < decisions; decision += 1) {
      const view = scene(decision, { aimAngle }, lastFire);
      const intent = brain.decide(
        { ...view, tick: decision * TICKS_PER_DECISION },
        memory,
        DECISION_MS,
      );
      intents.push(intent);
      aimAngle = intent.aimAngle;
      lastFire = intent.fire;
    }
    return intents;
  }

  it('depois da rajada máxima, solta o gatilho por 250 ms', () => {
    const params = BOT_DIFFICULTY_PARAMS.easy;
    const intents = runShooting(params, 40);
    const pattern = intents.map((intent) => (intent.fire ? 'F' : '.')).join('');
    const reactionDecisions = Math.ceil(params.reactionMs / DECISION_MS);
    const pauseDecisions = BOT_LEVEL1_CONFIG.burstPauseMs / DECISION_MS;
    // Reação, rajada de 3, pausa (a contagem da munição chega uma decisão depois), rajada...
    const burst = 'F'.repeat(params.maxBurst ?? 0);
    expect(pattern.slice(reactionDecisions)).toMatch(
      new RegExp(`^${burst}F?\\.{${Math.floor(pauseDecisions)},${Math.ceil(pauseDecisions) + 1}}F`),
    );
  });

  it('no difícil (maxBurst null), atira sem pausa', () => {
    const intents = runShooting(BOT_DIFFICULTY_PARAMS.hard, 25);
    const reactionDecisions = Math.ceil(BOT_DIFFICULTY_PARAMS.hard.reactionMs / DECISION_MS);
    expect(intents.slice(reactionDecisions).every((intent) => intent.fire)).toBe(true);
  });
});

describe('bot nível 1: segurança e munição', () => {
  it('não dispara com aliado vivo na linha antes do alvo', () => {
    const blocked = run(HARD, 30, fixed([ally('amigo', 1200, 1000), enemy('e', 1400, 1000)]));
    expect(fired(blocked)).toEqual([]);
    // Aliado morto ou atrás do alvo não atrapalha.
    const dead = run(
      HARD,
      30,
      fixed([ally('amigo', 1200, 1000, { alive: false }), enemy('e', 1400, 1000)]),
    );
    expect(fired(dead).length).toBeGreaterThan(0);
    const beyond = run(HARD, 30, fixed([ally('amigo', 1600, 1000), enemy('e', 1400, 1000)]));
    expect(fired(beyond).length).toBeGreaterThan(0);
  });

  it('recarrega com o pente vazio e não dispara enquanto isso', () => {
    const empty = run(HARD, 20, fixed([enemy('e', 1400, 1000)], { self: { ammo: 0 } }));
    expect(empty.intents[0]?.reload).toBe(true);
    expect(fired(empty)).toEqual([]);
    const reloading = run(
      HARD,
      20,
      fixed([enemy('e', 1400, 1000)], { self: { ammo: 0, reloading: true } }),
    );
    expect(reloading.intents.every((intent) => !intent.reload && !intent.fire)).toBe(true);
  });

  it('recarrega com o pente vazio também patrulhando', () => {
    const result = run(HARD, 1, fixed([], { self: { ammo: 0 } }));
    expect(result.intents[0]?.reload).toBe(true);
  });

  it('usa sempre a primária', () => {
    const result = run(MEDIUM, 20, fixed([enemy('e', 1400, 1000)]));
    expect(result.intents.every((intent) => intent.weaponSlot === 'primary')).toBe(true);
  });
});

describe('bot nível 1: perde o alvo', () => {
  it('volta a patrulhar quando o alvo sai da visão', () => {
    const waypoints = [{ x: 1000, y: 1500 }];
    const memory = createBotMemory(SEED);
    let visible = true;
    const scene = (_decision: number, self: Partial<PlayerViewSelf>) =>
      botView({ self, waypoints, others: visible ? [enemy('e', 1400, 1000)] : [] });
    const engaged = run(HARD, 15, scene, memory);
    expect(engaged.intents.at(-1)).toMatchObject({ moveX: 0, moveY: 0 });
    expect(fired(engaged).length).toBeGreaterThan(0);
    visible = false;
    const lost = run(HARD, 3, scene, memory);
    expect(lost.intents[0]).toMatchObject({ moveX: 0, moveY: 1, fire: false });
    expect(memory.target).toBeNull();
  });

  it('o tempo de reação recomeça quando o alvo volta à visão', () => {
    const params = BOT_DIFFICULTY_PARAMS.medium;
    const memory = createBotMemory(SEED);
    const brain = createLevel1Brain({ ...params, aimErrorDeg: 0 });
    const target = [enemy('e', 1400, 1000)];
    const decide = (tick: number, others: readonly PlayerViewOther[]) =>
      brain.decide(botView({ tick, others }), memory, DECISION_MS);
    decide(0, target);
    expect(decide(30, target).fire).toBe(true);
    decide(33, []);
    expect(decide(36, target).fire).toBe(false);
    expect(decide(36 + Math.ceil(params.reactionMs / TICK_MS), target).fire).toBe(true);
  });
});

describe('bot nível 1: morto', () => {
  it('não faz nada', () => {
    const result = run(HARD, 5, fixed([enemy('e', 1400, 1000)], { self: { alive: false } }));
    expect(result.intents.every((intent) => !intent.fire && intent.moveX === 0)).toBe(true);
  });
});
