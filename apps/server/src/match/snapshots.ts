// Snapshot montado para cada cliente. Neste marco ele contém todos os jogadores; o fog of war
// (marco 0.5) entra aqui, filtrando pelo que o jogador `viewerId` pode ver. A visão dos bots
// (BotController) sai deste mesmo snapshot.
// Regras de segurança: vida só do próprio jogador e dos aliados; a seed da partida nunca entra.

import { TICK_MS } from '@rainbow-pixel/shared';
import type {
  DevFlags,
  MatchEvent,
  SimWorld,
  SnapshotMessage,
  SnapshotPlayer,
  SnapshotSelf,
} from '@rainbow-pixel/shared';

export const NO_DEV_FLAGS: DevFlags = { god: false, noSpread: false };

export interface SnapshotInput {
  readonly world: SimWorld;
  /** Para quem é o snapshot. */
  readonly viewerId: string;
  /** Último seq do viewer já processado. */
  readonly ackSeq: number;
  readonly serverTimeMs: number;
  readonly isConnected: (playerId: string) => boolean;
  /** Eventos para este viewer (já filtrados por destinatário, com a redundância). */
  readonly events?: readonly MatchEvent[];
  /** Comandos de debug ativos do viewer. */
  readonly devFlags?: DevFlags;
}

export function buildSnapshot(input: SnapshotInput): SnapshotMessage {
  const { world, viewerId } = input;
  const viewer = world.players.find((player) => player.playerId === viewerId);

  const players = world.players.map((player): SnapshotPlayer => {
    const base: SnapshotPlayer = {
      playerId: player.playerId,
      team: player.team,
      x: player.x,
      y: player.y,
      aimAngle: player.aimAngle,
      moveMode: player.moveMode,
      connected: input.isConnected(player.playerId),
      alive: player.alive,
      activeSlot: player.weapon.activeSlot,
    };
    // Vida de inimigo nunca sai do servidor.
    const visible = viewer !== undefined && player.team === viewer.team;
    return visible ? { ...base, health: player.health } : base;
  });

  const self: SnapshotSelf | null =
    viewer === undefined
      ? null
      : {
          x: viewer.x,
          y: viewer.y,
          aimAngle: viewer.aimAngle,
          moveMode: viewer.moveMode,
          health: viewer.health,
          alive: viewer.alive,
          respawnInMs:
            viewer.respawnAtTick === null
              ? null
              : Math.max(0, (viewer.respawnAtTick - world.tick) * TICK_MS),
          weapon: viewer.weapon,
          dev: input.devFlags ?? NO_DEV_FLAGS,
        };

  return {
    tick: world.tick,
    serverTimeMs: input.serverTimeMs,
    ackSeq: input.ackSeq,
    self,
    players,
    events: input.events ?? [],
  };
}
