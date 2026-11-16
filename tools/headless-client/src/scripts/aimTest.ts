// Roteiro aim-test: a cada tick, mira no centro do inimigo vivo mais próximo na própria visão
// interpolada (a mesma do cliente web) e dispara a cada --fire-interval-ms quando o raio local,
// sem dispersão, acerta esse alvo sem passar por parede. Quem casa cada disparo com o
// hit_confirm (pelo seq) é o GameClient.

import { DEV_HEADLESS_CONFIG, hitscan, isWeaponReady } from '@rainbow-pixel/shared';
import type { PlayerInput } from '@rainbow-pixel/shared';
import type { InputScript, ScriptContext } from './types.js';

function hold(context: ScriptContext, aimAngle: number): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    aimAngle,
    moveMode: 'walk',
    fire: false,
    reload: false,
    weaponSlot: context.weaponSlot,
  };
}

/** Cada execução tem o próprio estado (último disparo e gatilho). */
export function aimTest(): InputScript {
  let lastFireMs = Number.NEGATIVE_INFINITY;
  let pressed = false;

  return (_tick, context) => {
    const { self } = context;
    if (self === null || !self.alive) {
      pressed = false;
      return hold(context, self?.aimAngle ?? 0);
    }
    const alive = context.others().filter((other) => other.alive);
    const enemies = alive
      .filter((other) => other.team !== self.team)
      .sort(
        (a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y),
      );
    const target = enemies[0];
    if (target === undefined) {
      pressed = false;
      return hold(context, self.aimAngle);
    }

    const aimAngle = Math.atan2(target.y - self.y, target.x - self.x);
    const { weapon } = self;
    const empty = weapon.ammo[weapon.activeSlot] === 0;
    // Mesmo raio que o GameClient usa para o acerto previsto: mira + recuo previsto, sem desvio.
    const shotAngle = aimAngle + (weapon.recoilDeg * Math.PI) / 180;
    const ray = hitscan(
      context.map,
      self,
      shotAngle,
      alive.map((other) => ({ playerId: other.playerId, x: other.x, y: other.y })),
    );
    const canFire =
      !pressed &&
      ray.target?.playerId === target.playerId &&
      weapon.activeSlot === context.weaponSlot &&
      isWeaponReady(weapon) &&
      weapon.cooldownMs === 0 &&
      !empty &&
      context.elapsedMs - lastFireMs >= context.fireIntervalMs &&
      // No fim do roteiro não dispara: o hit_confirm dos últimos disparos precisa chegar.
      context.elapsedMs < context.durationMs - DEV_HEADLESS_CONFIG.hitConfirmGraceMs;

    if (canFire) {
      lastFireMs = context.elapsedMs;
      pressed = true;
      return { ...hold(context, aimAngle), fire: true };
    }
    // Solta o gatilho no tick seguinte, para a semiautomática ver a borda no próximo disparo.
    pressed = false;
    return { ...hold(context, aimAngle), reload: empty && isWeaponReady(weapon) };
  };
}
