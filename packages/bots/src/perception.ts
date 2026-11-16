// Percepção do bot (escopo, seções 8.1 e 16.5): quais inimigos ele vê. Como o fog of war só
// entra no marco 0.5, o bot nível 1 aplica sozinho o cone de visão e a linha de visada sobre a
// PlayerView; no 0.5 o filtro do servidor passa a valer para os clientes e para o bot.

import { VISION_CONFIG, hasLineOfSight } from '@rainbow-pixel/shared';
import type { PlayerView, PlayerViewOther } from './PlayerView.js';
import { angleDifference } from './aim.js';

const HALF_CONE_RAD = ((VISION_CONFIG.coneDeg / 2) * Math.PI) / 180;

/**
 * O bot vê o jogador: dentro do cone de 100° para onde mira, até 900 px, ou dentro dos 48 px de
 * periferia em qualquer direção; nos dois casos, sem célula sólida no caminho.
 */
export function canSee(view: PlayerView, other: PlayerViewOther): boolean {
  const { self } = view;
  const dx = other.x - self.x;
  const dy = other.y - self.y;
  const distance = Math.hypot(dx, dy);
  const peripheral = distance <= VISION_CONFIG.peripheralPx;
  const inCone =
    distance <= VISION_CONFIG.rangePx &&
    Math.abs(angleDifference(self.aimAngle, Math.atan2(dy, dx))) <= HALF_CONE_RAD;
  return (peripheral || inCone) && hasLineOfSight(view.map, self, other);
}

/** Inimigos vivos que o bot vê, do mais perto ao mais longe (empate pelo playerId). */
export function visibleEnemies(view: PlayerView): PlayerViewOther[] {
  const { self } = view;
  const distance = (other: PlayerViewOther) => Math.hypot(other.x - self.x, other.y - self.y);
  return view.others
    .filter((other) => other.alive && other.team !== self.team && canSee(view, other))
    .sort(
      (a, b) =>
        distance(a) - distance(b) ||
        (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
    );
}
