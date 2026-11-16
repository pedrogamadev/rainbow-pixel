import type { CollisionMap, TeamIndex, Vec2, WeaponSlot } from '@rainbow-pixel/shared';

/** O próprio bot, como o snapshot `self` o descreve. */
export interface PlayerViewSelf {
  readonly playerId: string;
  readonly team: TeamIndex;
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly health: number;
  readonly alive: boolean;
  /** Arma na mão. */
  readonly activeSlot: WeaponSlot;
  /** Munição no pente da arma na mão. */
  readonly ammo: number;
  readonly reloading: boolean;
}

/** Outro jogador, com o que o snapshot dá a um cliente. Sem vida: nem de inimigo, nem de aliado. */
export interface PlayerViewOther {
  readonly playerId: string;
  readonly team: TeamIndex;
  readonly x: number;
  readonly y: number;
  readonly aimAngle: number;
  readonly alive: boolean;
}

/**
 * O que o bot sabe da partida: a mesma visão filtrada que um cliente humano receberia. O
 * servidor a monta a partir do mesmo `buildSnapshot` dos clientes, mais a informação pública do
 * mapa. Como o fog of war só entra no marco 0.5, a percepção do bot nível 1 aplica sozinha o
 * cone de visão e a linha de visada (perception.ts).
 */
export interface PlayerView {
  /** Tick do servidor em que a visão foi montada. */
  readonly tick: number;
  readonly self: PlayerViewSelf;
  /** Os outros jogadores, vivos ou mortos. */
  readonly others: readonly PlayerViewOther[];
  readonly mapId: string;
  /** Grade de colisão do mapa (informação pública), para a linha de visada. */
  readonly map: CollisionMap;
  /** Waypoints de patrulha (camada bot_hints), na ordem do circuito. */
  readonly waypoints: readonly Vec2[];
}
