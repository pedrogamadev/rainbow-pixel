import { AIM_NORTH, CAMERA_CONFIG } from '@rainbow-pixel/shared';
import { describe, expect, it } from 'vitest';
import {
  normalizeAngle,
  screenAngle,
  screenToWorld,
  screenUpOffset,
  turnAim,
  viewRotation,
  worldToScreen,
} from './camera.js';
import type { Camera } from './camera.js';

const EAST = 0;
const SOUTH = Math.PI / 2;
const DEG = Math.PI / 180;

function camera(aimAngle: number): Camera {
  return {
    center: { x: 400, y: 300 },
    focus: { x: 1000, y: 700 },
    rotation: viewRotation(aimAngle),
  };
}

/** Um ponto `distance` px à frente do jogador, na direção `angle` do mundo. */
function ahead(cam: Camera, angle: number, distance: number) {
  return {
    x: cam.focus.x + Math.cos(angle) * distance,
    y: cam.focus.y + Math.sin(angle) * distance,
  };
}

describe('câmera: a mira fica sempre para cima na tela', () => {
  it.each([
    ['norte', AIM_NORTH],
    ['leste', EAST],
    ['sul', SOUTH],
    ['qualquer', 2.3],
  ])('mirando para o %s, o ponto à frente aparece acima do jogador', (_name, aimAngle) => {
    const cam = camera(aimAngle);
    const screen = worldToScreen(cam, ahead(cam, aimAngle, 100));
    expect(screen.x).toBeCloseTo(400, 9);
    expect(screen.y).toBeCloseTo(200, 9);
  });

  it('mirando para o norte, o mapa não gira', () => {
    expect(viewRotation(AIM_NORTH)).toBe(0);
    const cam = camera(AIM_NORTH);
    expect(worldToScreen(cam, { x: 1050, y: 690 })).toEqual({ x: 450, y: 290 });
  });

  it('mirando para o leste, o sul do mapa aparece à direita do jogador', () => {
    const cam = camera(EAST);
    const screen = worldToScreen(cam, ahead(cam, SOUTH, 50));
    expect(screen.x).toBeCloseTo(450, 9);
    expect(screen.y).toBeCloseTo(300, 9);
  });

  it('o jogador fica no centro da tela', () => {
    expect(worldToScreen(camera(1.1), { x: 1000, y: 700 })).toEqual({ x: 400, y: 300 });
  });

  it('screenToWorld desfaz worldToScreen', () => {
    for (const aimAngle of [AIM_NORTH, EAST, SOUTH, -2.7, 0.9]) {
      const cam = camera(aimAngle);
      const point = { x: 1234.5, y: 456.25 };
      const back = screenToWorld(cam, worldToScreen(cam, point));
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });

  it('a direção de um ponto do mundo vira a direção dele na tela', () => {
    const cam = camera(0.7);
    const angle = -2.1;
    const screen = worldToScreen(cam, ahead(cam, angle, 80));
    const drawn = Math.atan2(screen.y - cam.center.y, screen.x - cam.center.x);
    expect(normalizeAngle(drawn - screenAngle(angle, cam.rotation))).toBeCloseTo(0, 9);
  });

  it('screenUpOffset fica acima do jogador na tela em qualquer giro', () => {
    for (const aimAngle of [AIM_NORTH, EAST, SOUTH, 2.9, -0.4]) {
      const cam = camera(aimAngle);
      const offset = screenUpOffset(cam.rotation, 20);
      const screen = worldToScreen(cam, { x: cam.focus.x + offset.x, y: cam.focus.y + offset.y });
      expect(screen.x).toBeCloseTo(400, 9);
      expect(screen.y).toBeCloseTo(280, 9);
    }
  });
});

describe('mouse travado gira a mira', () => {
  it('para a direita, a mira gira no sentido horário (vira para a direita)', () => {
    const turned = turnAim(AIM_NORTH, 100);
    expect(turned).toBeCloseTo(AIM_NORTH + 100 * CAMERA_CONFIG.mouseTurnDegPerPx * DEG, 12);
    // Do norte, virar para a direita aponta para o leste.
    expect(Math.cos(turned)).toBeGreaterThan(0);
  });

  it('para a esquerda, gira no sentido anti-horário', () => {
    expect(turnAim(EAST, -50)).toBeCloseTo(-50 * CAMERA_CONFIG.mouseTurnDegPerPx * DEG, 12);
  });

  it('sem movimento horizontal, a mira não muda', () => {
    expect(turnAim(1.25, 0)).toBe(1.25);
  });

  it('a mira fica sempre em [-π, π), mesmo depois de muitas voltas', () => {
    let aim = AIM_NORTH;
    for (let step = 0; step < 1000; step += 1) {
      aim = turnAim(aim, 337);
      expect(aim).toBeGreaterThanOrEqual(-Math.PI);
      expect(aim).toBeLessThan(Math.PI);
    }
  });

  it('normalizeAngle mantém a direção', () => {
    for (const angle of [-10, -Math.PI, 0, 3.5, 12.6]) {
      const normalized = normalizeAngle(angle);
      expect(Math.cos(normalized)).toBeCloseTo(Math.cos(angle), 12);
      expect(Math.sin(normalized)).toBeCloseTo(Math.sin(angle), 12);
    }
  });
});
