// Câmera da partida: segue o próprio jogador e gira o mapa com a mira, que fica sempre para cima
// na tela. Contas puras (sem PixiJS), no mesmo sentido do PixiJS: com y para baixo, rotação
// positiva gira no sentido horário.

import { AIM_NORTH, CAMERA_CONFIG } from '@rainbow-pixel/shared';
import type { Vec2 } from '@rainbow-pixel/shared';

const FULL_TURN = 2 * Math.PI;

/** O mesmo ângulo em [-π, π), para a mira não crescer sem limite de tanto girar. */
export function normalizeAngle(angle: number): number {
  return angle - FULL_TURN * Math.floor((angle + Math.PI) / FULL_TURN);
}

/**
 * Mira depois de o mouse travado andar `movementX` px na horizontal. Para a direita (positivo),
 * a mira gira no sentido horário: o jogador vira para a direita.
 */
export function turnAim(aimAngle: number, movementX: number): number {
  return normalizeAngle(aimAngle + (movementX * CAMERA_CONFIG.mouseTurnDegPerPx * Math.PI) / 180);
}

/** Giro do mundo na tela que deixa a mira apontando para cima. */
export function viewRotation(aimAngle: number): number {
  return AIM_NORTH - aimAngle;
}

export interface Camera {
  /** Onde o próprio jogador fica na tela. */
  readonly center: Vec2;
  /** Ponto do mundo desenhado no centro (o próprio jogador). */
  readonly focus: Vec2;
  /** Giro do mundo na tela (`viewRotation`). */
  readonly rotation: number;
}

/** Ponto do mundo -> ponto da tela. */
export function worldToScreen(camera: Camera, point: Vec2): Vec2 {
  const dx = point.x - camera.focus.x;
  const dy = point.y - camera.focus.y;
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  return { x: camera.center.x + dx * cos - dy * sin, y: camera.center.y + dx * sin + dy * cos };
}

/** Ponto da tela -> ponto do mundo (o inverso de `worldToScreen`). */
export function screenToWorld(camera: Camera, point: Vec2): Vec2 {
  const dx = point.x - camera.center.x;
  const dy = point.y - camera.center.y;
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  return { x: camera.focus.x + dx * cos + dy * sin, y: camera.focus.y - dx * sin + dy * cos };
}

/** Direção do mundo -> direção na tela, em radianos. */
export function screenAngle(worldAngle: number, rotation: number): number {
  return worldAngle + rotation;
}

/**
 * Deslocamento no mundo que aparece `distance` px acima na tela, com o mundo girado por
 * `rotation`. Serve para o que precisa ficar em pé na tela, como o nickname.
 */
export function screenUpOffset(rotation: number, distance: number): Vec2 {
  return { x: -distance * Math.sin(rotation), y: -distance * Math.cos(rotation) };
}
