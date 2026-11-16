// Dano de um acerto (escopo, seções 3.1 e 4.1): queda por distância, fogo amigo e
// arredondamento.

import type { WeaponDefinition } from '../catalog/weapons.js';
import { COMBAT_CONFIG } from '../config/index.js';

/**
 * Fator de dano pela distância: 1 até `rangePx`; de `rangePx` a 2 × `rangePx`, cai linearmente
 * até 0,6; depois disso fica em 0,6.
 */
export function damageFalloff(rangePx: number, distancePx: number): number {
  const min = COMBAT_CONFIG.damageFalloffMinMultiplier;
  const end = rangePx * COMBAT_CONFIG.damageFalloffEndRangeMultiplier;
  if (distancePx <= rangePx) {
    return 1;
  }
  if (distancePx >= end) {
    return min;
  }
  return 1 - ((1 - min) * (distancePx - rangePx)) / (end - rangePx);
}

/**
 * Dano final de um acerto, arredondado para inteiro.
 * @param distancePx distância entre o centro do atirador e o centro do alvo
 * @param friendly o alvo é do mesmo time: recebe só a fração do fogo amigo
 */
export function shotDamage(
  weapon: Pick<WeaponDefinition, 'damage' | 'rangePx'>,
  distancePx: number,
  friendly: boolean,
): number {
  const team = friendly ? COMBAT_CONFIG.friendlyFireMultiplier : 1;
  return Math.round(weapon.damage * damageFalloff(weapon.rangePx, distancePx) * team);
}
