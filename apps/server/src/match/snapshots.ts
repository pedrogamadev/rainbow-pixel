// Snapshot montado para cada cliente. Neste marco ele contém todos os jogadores; o fog of war
// (marco 0.5) entra aqui, filtrando pelo que o jogador `viewerId` pode ver.

import type { SimWorld, SnapshotMessage, TeamIndex } from '@rainbow-pixel/shared';

export interface SnapshotInput {
  readonly world: SimWorld;
  /** Para quem é o snapshot. */
  readonly viewerId: string;
  /** Último seq do viewer já processado. */
  readonly ackSeq: number;
  readonly serverTimeMs: number;
  readonly isConnected: (playerId: string) => boolean;
  readonly teamOf: (playerId: string) => TeamIndex;
}

export function buildSnapshot(input: SnapshotInput): SnapshotMessage {
  return {
    tick: input.world.tick,
    serverTimeMs: input.serverTimeMs,
    ackSeq: input.ackSeq,
    players: input.world.players.map((player) => ({
      playerId: player.playerId,
      team: input.teamOf(player.playerId),
      x: player.x,
      y: player.y,
      aimAngle: player.aimAngle,
      moveMode: player.moveMode,
      connected: input.isConnected(player.playerId),
    })),
  };
}
