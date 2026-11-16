// O que o HUD mínimo do marco 0.3 mostra, montado a partir da partida. TypeScript puro, para
// testar sem React. O HUD final é do marco 1.0.

import { COMBAT_CONFIG, getWeapon, weaponIdForSlot } from '@rainbow-pixel/shared';
import type { PlayerSimState, SnapshotSelf } from '@rainbow-pixel/shared';
import type { KillFeedEntry } from '../shots';

export interface HudKill {
  readonly eventId: number;
  readonly killer: string;
  readonly victim: string;
  readonly weapon: string;
  /** O próprio jogador matou ou morreu. */
  readonly involvesSelf: boolean;
}

export interface HudState {
  readonly health: number;
  readonly alive: boolean;
  /** Segundos até renascer, arredondados para cima. `null` enquanto vivo. */
  readonly respawnSeconds: number | null;
  readonly weaponName: string;
  readonly ammo: number;
  readonly magazine: number;
  /** Progresso da recarga, de 0 a 1. `null` sem recarga. */
  readonly reloadProgress: number | null;
  /** Progresso da troca de arma, de 0 a 1. `null` sem troca. */
  readonly switchProgress: number | null;
  readonly killFeed: readonly HudKill[];
}

/**
 * @param predicted estado previsto do próprio jogador (arma e munição, sem esperar o servidor)
 * @param server último `self` do servidor (vida, morte e tempo até renascer)
 */
export function buildHudState(
  predicted: PlayerSimState | null,
  server: SnapshotSelf | null,
  kills: readonly KillFeedEntry[],
  selfId: string,
  nicknameOf: (playerId: string) => string,
): HudState | null {
  if (predicted === null || server === null) {
    return null;
  }
  const { weapon } = predicted;
  const definition = getWeapon(weaponIdForSlot(weapon.activeSlot));
  return {
    health: server.health,
    alive: server.alive,
    respawnSeconds:
      server.alive || server.respawnInMs === null ? null : Math.ceil(server.respawnInMs / 1000),
    weaponName: definition.name,
    ammo: weapon.ammo[weapon.activeSlot],
    magazine: definition.magazine,
    reloadProgress: weapon.reloadLeftMs > 0 ? 1 - weapon.reloadLeftMs / definition.reloadMs : null,
    switchProgress:
      weapon.switchLeftMs > 0 ? 1 - weapon.switchLeftMs / COMBAT_CONFIG.weaponSwitchMs : null,
    killFeed: kills.map((kill) => ({
      eventId: kill.eventId,
      killer: nicknameOf(kill.killerId),
      victim: nicknameOf(kill.victimId),
      weapon: getWeapon(kill.weaponId).name,
      involvesSelf: kill.killerId === selfId || kill.victimId === selfId,
    })),
  };
}
