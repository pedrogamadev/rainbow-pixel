// Arma do jogador (marco 0.3): cadência, munição, recarga, troca, recuo e dispersão, em passo
// fixo. Roda no servidor (verdade) e na previsão do cliente, com o mesmo código.

import { getWeapon } from '../catalog/index.js';
import type { WeaponDefinition, WeaponId, WeaponSlot } from '../catalog/weapons.js';
import { COMBAT_CONFIG, getWeaponHandling } from '../config/index.js';
import type { WeaponHandling } from '../config/index.js';
import type { MoveMode, WeaponInput, WeaponState } from './types.js';

/**
 * Folga dos temporizadores: somar e subtrair TICK_MS (1000/30) deixa resíduos de ponto
 * flutuante. Um temporizador abaixo disso já acabou.
 */
const TIMER_EPSILON_MS = 1e-6;

/** Arma de cada slot no loadout fixo da partida. */
export function weaponIdForSlot(slot: WeaponSlot): WeaponId {
  return COMBAT_CONFIG.matchLoadout[slot];
}

export function weaponForSlot(slot: WeaponSlot): WeaponDefinition {
  return getWeapon(weaponIdForSlot(slot));
}

/** Arma no início da partida e ao renascer: primária na mão, pentes cheios. */
export function createWeaponState(activeSlot: WeaponSlot = 'primary'): WeaponState {
  return {
    activeSlot,
    ammo: {
      primary: weaponForSlot('primary').magazine,
      secondary: weaponForSlot('secondary').magazine,
    },
    cooldownMs: 0,
    reloadLeftMs: 0,
    switchLeftMs: 0,
    consecutiveShots: 0,
    bloomDeg: 0,
    recoilDeg: 0,
    recoilIndex: 0,
    triggerHeld: false,
    shotCount: 0,
  };
}

/**
 * Arma de quem renasce: pentes cheios, sem recarga, troca, recuo nem dispersão. Mantém a arma
 * na mão, o gatilho e o contador de disparos (o sorteio da dispersão não se repete).
 */
export function respawnWeaponState(weapon: WeaponState): WeaponState {
  return {
    ...createWeaponState(weapon.activeSlot),
    triggerHeld: weapon.triggerHeld,
    shotCount: weapon.shotCount,
  };
}

/** Acréscimo de dispersão pelo movimento do tick. */
function movementSpreadDeg(handling: WeaponHandling, moving: boolean, moveMode: MoveMode): number {
  if (!moving) {
    return 0;
  }
  return moveMode === 'slow' ? handling.slowSpreadDeg : handling.walkSpreadDeg;
}

/**
 * Dispersão atual da arma (meia abertura do cone, em graus): parado, mais o acréscimo pelo
 * movimento, mais o acumulado pelos tiros seguidos.
 */
export function spreadDeg(
  weapon: WeaponState,
  movement: { readonly moving: boolean; readonly moveMode: MoveMode },
): number {
  const handling = getWeaponHandling(weaponIdForSlot(weapon.activeSlot));
  return (
    handling.baseSpreadDeg +
    movementSpreadDeg(handling, movement.moving, movement.moveMode) +
    weapon.bloomDeg
  );
}

/** Arma pronta: sem troca nem recarga em andamento. */
export function isWeaponReady(weapon: WeaponState): boolean {
  return weapon.switchLeftMs === 0 && weapon.reloadLeftMs === 0;
}

export interface WeaponStepContext {
  readonly input: WeaponInput;
  /**
   * Input repetido pelo servidor com a fila vazia: não dispara, não recarrega e não troca, e o
   * gatilho continua o do último input real.
   */
  readonly repeated: boolean;
  /** Correndo com movimento: o tiro é ignorado. */
  readonly running: boolean;
  /** O jogador pediu movimento neste tick (para a dispersão). */
  readonly moving: boolean;
  readonly moveMode: MoveMode;
  readonly dtMs: number;
  /**
   * Desvio do disparo número `shotIndex`, de -1 a 1, multiplicado pela dispersão. `null`: sem
   * sorteio (cliente, que não conhece a seed, ou dispersão zerada pelo comando de debug).
   */
  readonly deviation: ((shotIndex: number) => number) | null;
}

export interface WeaponShot {
  readonly weaponId: WeaponId;
  /** Recuo mais desvio, somado à mira, em graus. */
  readonly offsetDeg: number;
  readonly shotIndex: number;
}

export interface WeaponStepResult {
  readonly weapon: WeaponState;
  /** Disparo deste tick (no máximo 1). `null`: não disparou. */
  readonly shot: WeaponShot | null;
}

function towardsZero(value: number, amount: number): number {
  return value > 0 ? Math.max(0, value - amount) : Math.min(0, value + amount);
}

/**
 * Avança a arma um tick.
 *
 * - Cadência: `cooldownMs` desce `dtMs` por tick; com o gatilho válido e o tempo vencido,
 *   dispara e soma 60000 / rpm, carregando a sobra entre disparos seguidos. Sem disparo, o
 *   tempo não fica abaixo de zero: soltar o gatilho não acumula tiros para depois.
 * - Automática dispara enquanto `fire` estiver ativo; semiautomática só na borda.
 * - Recarga: `reload` com pente incompleto inicia; disparar com o pente vazio também. Durante
 *   a recarga não dispara; ao terminar, o pente enche.
 * - Troca: `weaponSlot` diferente do ativo inicia a troca e cancela a recarga.
 * - Recuo e dispersão: cada disparo soma o próximo valor do padrão de recuo e o acréscimo por
 *   tiro seguido, até os tetos. A recuperação começa no primeiro tick sem disparo, isto é, o
 *   primeiro tick com a arma liberada pela cadência em que o jogador não dispara. Os ticks de
 *   espera entre dois disparos de uma rajada não contam.
 */
export function stepWeapon(weapon: WeaponState, context: WeaponStepContext): WeaponStepResult {
  const { input, repeated, dtMs } = context;
  let { activeSlot, ammo, cooldownMs, reloadLeftMs, switchLeftMs } = weapon;
  let { consecutiveShots, bloomDeg, recoilDeg, recoilIndex, shotCount } = weapon;

  cooldownMs -= dtMs;
  if (switchLeftMs > 0) {
    switchLeftMs = switchLeftMs - dtMs <= TIMER_EPSILON_MS ? 0 : switchLeftMs - dtMs;
  }
  if (reloadLeftMs > 0) {
    reloadLeftMs = reloadLeftMs - dtMs <= TIMER_EPSILON_MS ? 0 : reloadLeftMs - dtMs;
    if (reloadLeftMs === 0) {
      ammo = { ...ammo, [activeSlot]: weaponForSlot(activeSlot).magazine };
    }
  }

  if (!repeated) {
    if (input.weaponSlot !== activeSlot) {
      activeSlot = input.weaponSlot;
      switchLeftMs = COMBAT_CONFIG.weaponSwitchMs;
      reloadLeftMs = 0;
      consecutiveShots = 0;
      recoilIndex = 0;
    } else if (
      input.reload &&
      switchLeftMs === 0 &&
      reloadLeftMs === 0 &&
      ammo[activeSlot] < weaponForSlot(activeSlot).magazine
    ) {
      reloadLeftMs = weaponForSlot(activeSlot).reloadMs;
    }
  }

  const weaponId = weaponIdForSlot(activeSlot);
  const definition = getWeapon(weaponId);
  const handling = getWeaponHandling(weaponId);
  const pressed = !context.running && input.fire;
  let shot: WeaponShot | null = null;

  if (!repeated && pressed && switchLeftMs === 0 && reloadLeftMs === 0) {
    const edge = definition.fireMode === 'auto' || !weapon.triggerHeld;
    if (ammo[activeSlot] <= 0) {
      reloadLeftMs = definition.reloadMs;
    } else if (edge && cooldownMs <= TIMER_EPSILON_MS) {
      const spread =
        handling.baseSpreadDeg +
        movementSpreadDeg(handling, context.moving, context.moveMode) +
        bloomDeg;
      const deviationDeg = context.deviation === null ? 0 : context.deviation(shotCount) * spread;
      shot = { weaponId, offsetDeg: recoilDeg + deviationDeg, shotIndex: shotCount };

      ammo = { ...ammo, [activeSlot]: ammo[activeSlot] - 1 };
      cooldownMs += 60000 / definition.rpm;
      consecutiveShots += 1;
      shotCount += 1;
      bloomDeg = Math.min(bloomDeg + handling.shotSpreadDeg, handling.maxShotSpreadDeg);
      const pattern = handling.recoilPatternDeg;
      const kick = pattern[recoilIndex % pattern.length] ?? 0;
      recoilDeg = Math.max(
        -handling.maxRecoilDeg,
        Math.min(handling.maxRecoilDeg, recoilDeg + kick),
      );
      recoilIndex = (recoilIndex + 1) % pattern.length;
    }
  }

  if (shot === null && cooldownMs <= TIMER_EPSILON_MS) {
    // Tick sem disparo com a arma liberada: a sequência acabou e começa a recuperação.
    cooldownMs = 0;
    consecutiveShots = 0;
    recoilIndex = 0;
    const seconds = dtMs / 1000;
    bloomDeg = Math.max(0, bloomDeg - handling.spreadRecoveryDegPerSec * seconds);
    recoilDeg = towardsZero(recoilDeg, handling.recoilRecoveryDegPerSec * seconds);
  }

  return {
    weapon: {
      activeSlot,
      ammo,
      cooldownMs,
      reloadLeftMs,
      switchLeftMs,
      consecutiveShots,
      bloomDeg,
      recoilDeg,
      recoilIndex,
      triggerHeld: repeated ? weapon.triggerHeld : pressed,
      shotCount,
    },
    shot,
  };
}
