import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config/index.js';
import { createSeededRandom } from '../random/index.js';
import { circleOverlapsSolid, moveCircle } from './collision.js';
import { AIM_NORTH, TICK_SECONDS, stepPlayer } from './movement.js';
import { mapWithWalls } from './testing/asciiMap.js';
import { testPlayer } from './testing/fixtures.js';
import type { AsciiMap } from './testing/asciiMap.js';
import type { MoveAxis, MoveInput, PlayerSimState } from './types.js';

const R = SIM_CONFIG.playerRadius;
const RUN_STEP = SIM_CONFIG.moveSpeedPxPerSec.run * TICK_SECONDS;
const WALK_STEP = SIM_CONFIG.moveSpeedPxPerSec.walk * TICK_SECONDS;

function player(x: number, y: number): PlayerSimState {
  return testPlayer('p1', x, y);
}

/** Mirando para o norte, o movimento relativo à mira segue os eixos do mundo. */
function input(moveX: MoveAxis, moveY: MoveAxis, moveMode: MoveInput['moveMode'] = 'walk') {
  return { moveX, moveY, aimAngle: AIM_NORTH, moveMode } as const;
}

function hold(map: AsciiMap, state: PlayerSimState, move: MoveInput, ticks: number) {
  const path: PlayerSimState[] = [];
  let current = state;
  for (let tick = 0; tick < ticks; tick += 1) {
    current = stepPlayer(map, current, move, TICK_SECONDS);
    path.push(current);
  }
  return path;
}

function last<T>(items: readonly T[]): T {
  const item = items.at(-1);
  if (item === undefined) throw new Error('lista vazia');
  return item;
}

describe('não atravessa parede', () => {
  // Parede de uma célula (8 px) de espessura: x de 240 a 248.
  const vertical = mapWithWalls(60, 60, (cx) => cx === 30);
  // A mesma parede, deitada: y de 240 a 248.
  const horizontal = mapWithWalls(60, 60, (_cx, cy) => cy === 30);

  it.each([RUN_STEP, 30, 60])(
    'nenhum ângulo cruza uma parede fina (passo de %d px)',
    (stepLength) => {
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const angle = (degrees * Math.PI) / 180;
        const dx = Math.cos(angle) * stepLength;
        const dy = Math.sin(angle) * stepLength;
        let a = { x: 120, y: 240 };
        let b = { x: 240, y: 120 };
        for (let step = 0; step < 80; step += 1) {
          a = moveCircle(vertical, a.x, a.y, R, dx, dy);
          b = moveCircle(horizontal, b.x, b.y, R, dy, dx);
          expect(a.x).toBeLessThanOrEqual(240 - R + 1e-6);
          expect(b.y).toBeLessThanOrEqual(240 - R + 1e-6);
          expect(circleOverlapsSolid(vertical, a.x, a.y, R)).toBe(false);
          expect(circleOverlapsSolid(horizontal, b.x, b.y, R)).toBe(false);
        }
      }
    },
  );

  it('correndo em qualquer das 8 direções, nunca sai de uma sala fechada', () => {
    // Sala de paredes finas com pilares no meio.
    const room = mapWithWalls(
      40,
      40,
      (cx, cy) =>
        cx === 5 ||
        cx === 34 ||
        cy === 5 ||
        cy === 34 ||
        (cx >= 15 && cx < 18 && cy >= 15 && cy < 18) ||
        (cx >= 24 && cx < 26 && cy >= 20 && cy < 30),
    );
    const random = createSeededRandom(7);
    const axes: readonly MoveAxis[] = [-1, 0, 1];
    let state = player(100, 100);
    let move = input(1, 1, 'run');
    for (let tick = 0; tick < 3000; tick += 1) {
      if (tick % 20 === 0) {
        const moveX = axes[Math.floor(random() * 3)] ?? 0;
        const moveY = axes[Math.floor(random() * 3)] ?? 0;
        move = input(moveX, moveY, 'run');
      }
      state = stepPlayer(room, state, move, TICK_SECONDS);
      expect(circleOverlapsSolid(room, state.x, state.y, R)).toBe(false);
      expect(state.x).toBeGreaterThan(48 + R - 1e-6);
      expect(state.x).toBeLessThan(272 - R + 1e-6);
      expect(state.y).toBeGreaterThan(48 + R - 1e-6);
      expect(state.y).toBeLessThan(272 - R + 1e-6);
    }
  });
});

describe('desliza ao longo da parede', () => {
  // Parede vertical comprida, de várias células: face esquerda em x = 240.
  const map = mapWithWalls(60, 80, (cx, cy) => cx === 30 && cy >= 2 && cy < 70);

  it('na diagonal contra a parede, segue no outro eixo sem perder velocidade', () => {
    const path = hold(map, player(220, 100), input(1, 1), 60);
    const touching = path.filter((state) => state.x >= 240 - R - 1e-9);
    expect(touching.length).toBeGreaterThan(40);
    const diagonalStep = WALK_STEP * Math.SQRT1_2;
    for (let index = 1; index < touching.length; index += 1) {
      const previous = touching[index - 1];
      const current = touching[index];
      if (previous === undefined || current === undefined) continue;
      expect(current.x).toBeCloseTo(240 - R, 9);
      // Passa por várias emendas de célula sem travar.
      expect(current.y - previous.y).toBeCloseTo(diagonalStep, 9);
    }
  });

  it('chegando ao fim da parede, continua na diagonal', () => {
    const end = last(hold(map, player(220, 500), input(1, 1), 60));
    // A parede acaba em y = 560; depois dela o jogador passa para o outro lado.
    expect(end.x).toBeGreaterThan(260);
    expect(circleOverlapsSolid(map, end.x, end.y, R)).toBe(false);
  });
});

describe('não fica preso em quina', () => {
  it('no canto interno, encosta nas duas paredes e sai em qualquer direção livre', () => {
    // Paredes em L: face direita em x = 240 e face de baixo em y = 240.
    const map = mapWithWalls(
      60,
      60,
      (cx, cy) => (cx === 30 && cy <= 30) || (cy === 30 && cx <= 30),
    );
    const cornered = last(hold(map, player(200, 200), input(1, 1), 60));
    expect(cornered.x).toBeCloseTo(240 - R, 9);
    expect(cornered.y).toBeCloseTo(240 - R, 9);
    expect(circleOverlapsSolid(map, cornered.x, cornered.y, R)).toBe(false);

    // Empurrando só contra uma das paredes, não se mexe nem treme.
    expect(last(hold(map, cornered, input(1, 0), 10))).toMatchObject({
      x: cornered.x,
      y: cornered.y,
    });

    for (const [moveX, moveY] of [
      [-1, -1],
      [-1, 0],
      [0, -1],
      [-1, 1],
    ] as const) {
      const away = stepPlayer(map, cornered, input(moveX, moveY), TICK_SECONDS);
      expect(Math.hypot(away.x - cornered.x, away.y - cornered.y)).toBeGreaterThan(WALK_STEP * 0.7);
    }
  });

  describe('vão de porta de 6 células numa parede fina (y de 160 a 208)', () => {
    const map = mapWithWalls(60, 60, (cx, cy) => cx === 30 && (cy < 20 || cy >= 26));

    it.each([162, 164, 170, 184, 198, 204, 206])(
      'andando reto para a direita com o centro em y = %d, passa pela porta',
      (y) => {
        const end = last(hold(map, player(150, y), input(1, 0), 60));
        expect(end.x).toBeGreaterThan(248 + R);
        expect(end.y).toBeGreaterThanOrEqual(160 + R - 1e-6);
        expect(end.y).toBeLessThanOrEqual(208 - R + 1e-6);
      },
    );

    it('de frente para a parede (fora do vão), para e não desliza', () => {
      const end = last(hold(map, player(150, 140), input(1, 0), 60));
      expect(end.x).toBeCloseTo(240 - R, 9);
      expect(end.y).toBe(140);
    });
  });

  it('num vão mais estreito que o jogador, para sem tremer', () => {
    // Vão de 2 células (16 px) para um jogador de 24 px de diâmetro.
    const map = mapWithWalls(60, 60, (cx, cy) => cx === 30 && (cy < 20 || cy >= 22));
    for (const y of [167, 168, 169]) {
      const path = hold(map, player(150, y), input(1, 0), 60);
      const end = last(path);
      expect(end.x).toBeLessThan(240);
      expect(end.y).toBe(y);
      expect(circleOverlapsSolid(map, end.x, end.y, R)).toBe(false);
    }
  });

  it('contra a quina de um pilar, contorna e segue em frente', () => {
    // Pilar de 4x4 células: x e y de 240 a 272.
    const map = mapWithWalls(60, 60, (cx, cy) => cx >= 30 && cx < 34 && cy >= 30 && cy < 34);
    const end = last(hold(map, player(180, 234), input(1, 0), 60));
    expect(end.x).toBeGreaterThan(272 + R);
    expect(end.y).toBeCloseTo(240 - R, 5);
  });
});
