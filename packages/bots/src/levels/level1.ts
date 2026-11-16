// Bot nível 1, "atirador" (escopo, seção 16.3): ao ver um inimigo, para de andar, gira a mira
// com velocidade limitada, espera o tempo de reação e atira com erro de mira, em rajadas.
// Recarrega quando o pente acaba. Sem inimigo à vista, patrulha como o nível 0. Lembrar a
// última posição vista é do nível 2.

import { BOT_LEVEL1_CONFIG, SIM_CONFIG, rayCircleDistance } from '@rainbow-pixel/shared';
import type { BotDifficultyParams } from '@rainbow-pixel/shared';
import type { BotBrain, BotIntent } from '../BotBrain.js';
import type { PlayerView, PlayerViewOther } from '../PlayerView.js';
import { degToRad, drawAimError, hasReacted, isOnTarget, turnTowards } from '../aim.js';
import type { BotMemory } from '../memory.js';
import { visibleEnemies } from '../perception.js';
import { HOLD_FIRE, level0Brain } from './level0.js';

/** Um aliado vivo cruza o raio da mira antes de chegar ao alvo. */
export function allyInLine(view: PlayerView, aimAngle: number, target: PlayerViewOther): boolean {
  const { self } = view;
  const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
  const toTarget = Math.hypot(target.x - self.x, target.y - self.y);
  return view.others.some((other) => {
    if (!other.alive || other.team !== self.team || other.playerId === self.playerId) {
      return false;
    }
    const distance = rayCircleDistance(self, dir, other, SIM_CONFIG.playerRadius);
    return distance !== null && distance < toTarget;
  });
}

/** Conta os disparos desde a decisão anterior pela munição que saiu do pente. */
function countShots(view: PlayerView, memory: BotMemory): void {
  const { ammo } = view.self;
  if (memory.lastAmmo !== null && ammo < memory.lastAmmo) {
    memory.burstShots += memory.lastAmmo - ammo;
  }
  memory.lastAmmo = ammo;
}

function forgetTarget(memory: BotMemory): void {
  memory.target = null;
  memory.burstShots = 0;
  memory.burstPauseLeftMs = 0;
}

export function createLevel1Brain(params: BotDifficultyParams): BotBrain {
  function decide(view: PlayerView, memory: BotMemory, dtMs: number): BotIntent {
    const { self } = view;
    countShots(view, memory);
    memory.burstPauseLeftMs = Math.max(0, memory.burstPauseLeftMs - dtMs);
    const reload = self.alive && self.ammo === 0 && !self.reloading;

    if (!self.alive) {
      // Morto: esquece o alvo e, ao renascer no spawn, recomeça a patrulha pelo waypoint mais
      // perto, como o nível 0 faz no início da partida.
      forgetTarget(memory);
      memory.waypointIndex = null;
      memory.pauseLeftMs = 0;
      memory.aimAngle = null;
      return { moveX: 0, moveY: 0, aimAngle: self.aimAngle, moveMode: 'walk', ...HOLD_FIRE };
    }

    const [target] = visibleEnemies(view);
    if (target === undefined) {
      // Perdeu o alvo (ou nunca viu): volta a patrulhar como o nível 0.
      forgetTarget(memory);
      return { ...level0Brain.decide(view, memory, dtMs), reload };
    }

    if (memory.target?.playerId !== target.playerId) {
      // Alvo novo: o tempo de reação conta a partir de agora, com erro de mira novo.
      memory.target = { playerId: target.playerId, sinceTick: view.tick };
      memory.aimErrorDeg = drawAimError(memory, params);
      memory.burstShots = 0;
      memory.burstPauseLeftMs = 0;
    }
    if (params.maxBurst !== null && memory.burstShots >= params.maxBurst) {
      // Rajada máxima: solta o gatilho por um tempo e corrige a mira com um sorteio novo.
      memory.burstShots = 0;
      memory.burstPauseLeftMs = BOT_LEVEL1_CONFIG.burstPauseMs;
      memory.aimErrorDeg = drawAimError(memory, params);
    }

    const desired = Math.atan2(target.y - self.y, target.x - self.x) + degToRad(memory.aimErrorDeg);
    const maxTurn = degToRad(params.turnSpeedDegPerSec) * (dtMs / 1000);
    const aimAngle = turnTowards(self.aimAngle, desired, maxTurn);
    memory.aimAngle = aimAngle;

    const fire =
      hasReacted(memory.target.sinceTick, view.tick, params) &&
      isOnTarget(aimAngle, desired) &&
      memory.burstPauseLeftMs === 0 &&
      self.ammo > 0 &&
      !self.reloading &&
      !allyInLine(view, aimAngle, target);

    return {
      moveX: 0,
      moveY: 0,
      aimAngle,
      moveMode: 'walk',
      fire,
      reload,
      weaponSlot: BOT_LEVEL1_CONFIG.weaponSlot,
    };
  }

  return { level: 1, decide };
}
