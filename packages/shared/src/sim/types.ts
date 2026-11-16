import type { WeaponId, WeaponSlot } from '../catalog/weapons.js';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const TEAM_INDEXES = [0, 1] as const;

/** Time 0 (ataque neste marco) ou time 1 (defesa). */
export type TeamIndex = (typeof TEAM_INDEXES)[number];

export const MOVE_MODES = ['walk', 'slow', 'run'] as const;

/** Andar, andar lento (Shift) ou correr (Ctrl). */
export type MoveMode = (typeof MOVE_MODES)[number];

/** Direção de um eixo do teclado. */
export type MoveAxis = -1 | 0 | 1;

/** Movimento e mira de um tick. */
export interface MoveInput {
  readonly moveX: MoveAxis;
  readonly moveY: MoveAxis;
  /** Radianos, finito. */
  readonly aimAngle: number;
  readonly moveMode: MoveMode;
}

/** Ações de arma de um tick. */
export interface WeaponInput {
  /** Botão de tiro pressionado neste tick. */
  readonly fire: boolean;
  /** Pedido de recarga. */
  readonly reload: boolean;
  /** Arma desejada. Diferente da ativa, inicia a troca. */
  readonly weaponSlot: WeaponSlot;
}

/** O que o jogador quer fazer em um tick: movimento, mira e arma. */
export interface PlayerInput extends MoveInput, WeaponInput {}

/** Input numerado enviado pelo cliente (ou gerado para o bot), um por tick. */
export interface InputCommand extends PlayerInput {
  /** Inteiro crescente por jogador. */
  readonly seq: number;
  /**
   * Instante do relógio do servidor (ms) que o cliente estava desenhando para os outros
   * jogadores quando amostrou o input (a hora da interpolação). Usado pela compensação de lag.
   */
  readonly viewTimeMs: number;
}

/** Arma do jogador: o que a simulação avança a cada tick (stepWeapon). */
export interface WeaponState {
  readonly activeSlot: WeaponSlot;
  /** Munição no pente de cada arma. A reserva é infinita: só o pente conta. */
  readonly ammo: Readonly<Record<WeaponSlot, number>>;
  /** Espera até o próximo disparo. Desce TICK_MS por tick. */
  readonly cooldownMs: number;
  /** Tempo que falta da recarga. 0: não está recarregando. */
  readonly reloadLeftMs: number;
  /** Tempo que falta da troca de arma. 0: não está trocando. */
  readonly switchLeftMs: number;
  /** Disparos da sequência atual, sem tick parado no meio. */
  readonly consecutiveShots: number;
  /** Dispersão acumulada pelos tiros seguidos, em graus. */
  readonly bloomDeg: number;
  /** Recuo acumulado somado à mira, em graus. */
  readonly recoilDeg: number;
  /** Posição no padrão de recuo da arma ativa. */
  readonly recoilIndex: number;
  /** O gatilho estava pressionado no último input real (borda da semiautomática). */
  readonly triggerHeld: boolean;
  /** Disparos do jogador na partida, usado no sorteio da dispersão. */
  readonly shotCount: number;
}

export interface PlayerSimState {
  readonly playerId: string;
  readonly team: TeamIndex;
  /** Centro do círculo do jogador, em px. */
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly moveMode: MoveMode;
  readonly health: number;
  readonly alive: boolean;
  /** Tick em que o jogador morto volta ao spawn. `null` enquanto vivo. */
  readonly respawnAtTick: number | null;
  readonly weapon: WeaponState;
}

/** Um disparo gerado pela arma de um jogador num tick, antes de saber o que acertou. */
export interface ShotFired {
  readonly shooterId: string;
  readonly weaponId: WeaponId;
  /** Centro do atirador depois do movimento do tick. */
  readonly origin: Vec2;
  /** Direção final: mira + recuo + desvio, em radianos. */
  readonly angle: number;
  /** Valor de `shotCount` deste disparo (o primeiro disparo da partida é 0). */
  readonly shotIndex: number;
}

export function isMoveMode(value: unknown): value is MoveMode {
  return MOVE_MODES.some((mode) => mode === value);
}

export function isTeamIndex(value: unknown): value is TeamIndex {
  return TEAM_INDEXES.some((team) => team === value);
}
