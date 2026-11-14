// Bot nível 0, "boneco" (escopo, seção 16.3): patrulha os waypoints de bot_hints em circuito,
// em linha reta e sem pathfinding. Para 1 s em cada waypoint e mira para onde anda. Se não
// chega mais perto do waypoint por 2 s, pula para o próximo. Sem waypoints, fica parado.
// A dificuldade não muda nada neste nível.

import { BOT_LEVEL0_CONFIG } from '@rainbow-pixel/shared';
import type { InputCommand, MoveAxis, Vec2 } from '@rainbow-pixel/shared';
import type { BotBrain } from '../BotBrain.js';
import type { PlayerView } from '../PlayerView.js';
import type { BotMemory } from '../memory.js';

/** As 8 direções do teclado, a partir do leste, no sentido horário (y cresce para baixo). */
const DIRECTIONS: readonly (readonly [MoveAxis, MoveAxis])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Direção do teclado mais próxima da reta até o alvo. */
export function directionTowards(dx: number, dy: number): readonly [MoveAxis, MoveAxis] {
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRECTIONS[(octant + DIRECTIONS.length) % DIRECTIONS.length] ?? [0, 0];
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function nearestIndex(points: readonly Vec2[], from: Vec2): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const current = distance(from, point);
    if (current < bestDistance) {
      best = index;
      bestDistance = current;
    }
  });
  return best;
}

function setTarget(memory: BotMemory, index: number): void {
  memory.waypointIndex = index;
  memory.bestDistance = Number.POSITIVE_INFINITY;
  memory.noProgressMs = 0;
}

function decide(view: PlayerView, memory: BotMemory, dtMs: number): InputCommand {
  const seq = memory.nextSeq;
  memory.nextSeq += 1;
  const { self, waypoints } = view;
  const stand = (): InputCommand => ({
    seq,
    moveX: 0,
    moveY: 0,
    aimAngle: memory.aimAngle ?? self.aimAngle,
    moveMode: 'walk',
  });

  if (waypoints.length === 0) {
    return stand();
  }
  if (memory.waypointIndex === null || memory.waypointIndex >= waypoints.length) {
    // Começa pelo waypoint mais perto e segue o circuito a partir dele.
    setTarget(memory, nearestIndex(waypoints, self));
  }

  if (memory.pauseLeftMs > 0) {
    memory.pauseLeftMs = Math.max(0, memory.pauseLeftMs - dtMs);
    if (memory.pauseLeftMs > 0) {
      return stand();
    }
    setTarget(memory, ((memory.waypointIndex ?? 0) + 1) % waypoints.length);
  }

  let index = memory.waypointIndex ?? 0;
  let target = waypoints[index];
  if (target === undefined) {
    return stand();
  }
  let remaining = distance(self, target);

  if (remaining <= BOT_LEVEL0_CONFIG.arriveRadiusPx) {
    memory.pauseLeftMs = BOT_LEVEL0_CONFIG.waypointPauseMs;
    return stand();
  }

  if (remaining < memory.bestDistance - BOT_LEVEL0_CONFIG.minProgressPx) {
    memory.bestDistance = remaining;
    memory.noProgressMs = 0;
  } else {
    memory.noProgressMs += dtMs;
    if (memory.noProgressMs >= BOT_LEVEL0_CONFIG.stuckTimeoutMs) {
      // Preso (parede no caminho): desiste deste waypoint e vai para o próximo.
      index = (index + 1) % waypoints.length;
      setTarget(memory, index);
      target = waypoints[index] ?? target;
      remaining = distance(self, target);
      memory.bestDistance = remaining;
    }
  }

  const [moveX, moveY] = directionTowards(target.x - self.x, target.y - self.y);
  const aimAngle = Math.atan2(moveY, moveX);
  memory.aimAngle = aimAngle;
  return { seq, moveX, moveY, aimAngle, moveMode: 'walk' };
}

export const level0Brain: BotBrain = { level: 0, decide };
