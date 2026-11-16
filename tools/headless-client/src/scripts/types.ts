import type {
  CollisionMap,
  MoveAxis,
  MoveInput,
  MoveMode,
  PlayerInput,
  PlayerSimState,
  WeaponSlot,
} from '@rainbow-pixel/shared';
import type { RenderedPlayer } from '../../../../apps/client/src/game/GameClient.js';

/** Eixo do roteiro strafe. */
export type StrafeAxis = 'x' | 'y';

/** O que o roteiro sabe em cada tick. Os roteiros de movimento só usam a arma. */
export interface ScriptContext {
  /** Tempo do roteiro: ticks já amostrados x TICK_MS. */
  readonly elapsedMs: number;
  /** Duração total do roteiro. */
  readonly durationMs: number;
  /** Arma que o roteiro segura (--weapon). */
  readonly weaponSlot: WeaponSlot;
  /** aim-test: intervalo mínimo entre dois disparos (--fire-interval-ms). */
  readonly fireIntervalMs: number;
  /** strafe: eixo do vaivém (--axis). */
  readonly axis: StrafeAxis;
  /** O próprio jogador como o cliente prevê. `null` antes do primeiro snapshot. */
  readonly self: PlayerSimState | null;
  /** Os outros jogadores na visão interpolada (a mesma do cliente web). */
  readonly others: () => readonly RenderedPlayer[];
  readonly map: CollisionMap;
}

/** Input do tick `tick` (0, 1, 2...). Os roteiros de movimento dão sempre o mesmo para o mesmo tick. */
export type InputScript = (tick: number, context: ScriptContext) => PlayerInput;

/** Roteiro de movimento puro: só anda e mira, sem atirar. */
export type MoveScript = (tick: number) => MoveInput;

/** As 8 direções do teclado, a partir do leste, no sentido horário (y cresce para baixo). */
export const DIRECTIONS: readonly (readonly [MoveAxis, MoveAxis])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** Anda na direção dada, mirando para onde anda. */
export function move(
  direction: readonly [MoveAxis, MoveAxis],
  moveMode: MoveMode = 'walk',
): MoveInput {
  const [moveX, moveY] = direction;
  return { moveX, moveY, aimAngle: Math.atan2(moveY, moveX), moveMode };
}

/** Roteiro de movimento que segura a arma pedida, sem atirar nem recarregar. */
export function withWeapon(script: MoveScript): InputScript {
  return (tick, context) => ({
    ...script(tick),
    fire: false,
    reload: false,
    weaponSlot: context.weaponSlot,
  });
}
