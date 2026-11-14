import type { Vec2 } from '@rainbow-pixel/shared';

/**
 * O que o bot sabe da partida: a mesma visão filtrada que um cliente humano receberia.
 * Marco 0.2: só o próprio bot e a informação pública do mapa. Não há outros jogadores aqui;
 * a visão cresce nos próximos marcos, sempre com o mesmo filtro de um cliente.
 */
export interface PlayerView {
  /** Tick do servidor em que a visão foi montada. */
  readonly tick: number;
  readonly self: {
    readonly playerId: string;
    readonly x: number;
    readonly y: number;
    readonly aimAngle: number;
  };
  readonly mapId: string;
  /** Waypoints de patrulha (camada bot_hints), na ordem do circuito. */
  readonly waypoints: readonly Vec2[];
}
