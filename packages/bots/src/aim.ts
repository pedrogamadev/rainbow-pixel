// Mira do bot (escopo, seções 16.4 e 16.5): tempo de reação, giro com velocidade limitada,
// erro de mira e rajada, conforme a dificuldade (BOT_DIFFICULTY_PARAMS).

import { BOT_LEVEL1_CONFIG, TICK_MS, hashRandom } from '@rainbow-pixel/shared';
import type { BotDifficultyParams } from '@rainbow-pixel/shared';
import type { BotMemory } from './memory.js';

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Diferença `to - from` pelo menor arco, em (-π, π]. */
export function angleDifference(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Gira de `current` para `desired` pelo menor arco, no máximo `maxStep` radianos. */
export function turnTowards(current: number, desired: number, maxStep: number): number {
  const delta = angleDifference(current, desired);
  if (Math.abs(delta) <= maxStep) {
    return desired;
  }
  return current + Math.sign(delta) * maxStep;
}

/** Próximo número em [0, 1) dos sorteios do bot: `hashRandom(seed, contador)`. */
export function nextRandom(memory: BotMemory): number {
  const value = hashRandom(memory.seed, memory.randomCounter);
  memory.randomCounter += 1;
  return value;
}

/** Sorteia o erro de mira de uma rajada, em graus, de -aimErrorDeg a +aimErrorDeg. */
export function drawAimError(memory: BotMemory, params: BotDifficultyParams): number {
  return (nextRandom(memory) * 2 - 1) * params.aimErrorDeg;
}

/** O tempo de reação já passou desde que o alvo ficou visível (no tick `sinceTick`). */
export function hasReacted(sinceTick: number, tick: number, params: BotDifficultyParams): boolean {
  return (tick - sinceTick) * TICK_MS >= params.reactionMs - 1e-6;
}

/** A mira está perto o bastante do ponto escolhido para disparar. */
export function isOnTarget(aimAngle: number, desired: number): boolean {
  return (
    Math.abs(angleDifference(aimAngle, desired)) <= degToRad(BOT_LEVEL1_CONFIG.fireToleranceDeg)
  );
}
