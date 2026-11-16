export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const MOVE_MODES = ['walk', 'slow', 'run'] as const;

/** Andar, andar lento (Shift) ou correr (Ctrl). */
export type MoveMode = (typeof MOVE_MODES)[number];

/** Direção de um eixo do teclado. */
export type MoveAxis = -1 | 0 | 1;

/** O que o jogador quer fazer em um tick. */
export interface MoveInput {
  readonly moveX: MoveAxis;
  readonly moveY: MoveAxis;
  /** Radianos, finito. */
  readonly aimAngle: number;
  readonly moveMode: MoveMode;
}

/** Input numerado enviado pelo cliente (ou pelo cérebro do bot), um por tick. */
export interface InputCommand extends MoveInput {
  /** Inteiro crescente por jogador. */
  readonly seq: number;
}

export interface PlayerSimState {
  readonly playerId: string;
  /** Centro do círculo do jogador, em px. */
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly moveMode: MoveMode;
}

export function isMoveMode(value: unknown): value is MoveMode {
  return MOVE_MODES.some((mode) => mode === value);
}
