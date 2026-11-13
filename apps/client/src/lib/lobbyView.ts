// Transforma o estado sincronizado da sala em dados simples para a tela do lobby.

import { MATCH_CONFIG, TEAM_INDEXES } from '@rainbow-pixel/shared';
import type {
  BotDifficultyId,
  LobbyPlayerKind,
  QuickMatchState,
  TeamIndex,
} from '@rainbow-pixel/shared';

export interface LobbyPlayerView {
  /** sessionId para humano, `bot:<n>` para bot. */
  readonly playerId: string;
  readonly kind: LobbyPlayerKind;
  readonly nickname: string;
  readonly team: TeamIndex;
  readonly ready: boolean;
  readonly connected: boolean;
  /** Vazio para humano. */
  readonly botDifficulty: BotDifficultyId | '';
  readonly isHost: boolean;
  /** É o jogador desta aba. */
  readonly isSelf: boolean;
}

export interface LobbyTeamView {
  readonly team: TeamIndex;
  /** Vagas do time, com os jogadores na ordem de entrada. `null` é vaga livre. */
  readonly slots: readonly (LobbyPlayerView | null)[];
}

export interface LobbyView {
  readonly code: string;
  readonly teams: readonly LobbyTeamView[];
  /** Humanos e bots na sala. */
  readonly playerCount: number;
  /** O jogador desta aba. `null` enquanto o estado ainda não o inclui. */
  readonly self: LobbyPlayerView | null;
  readonly isHost: boolean;
}

export function toLobbyView(state: QuickMatchState, selfSessionId: string): LobbyView {
  const players: LobbyPlayerView[] = [];
  state.players.forEach((player, playerId) => {
    players.push({
      playerId,
      kind: player.kind,
      nickname: player.nickname,
      team: player.team,
      ready: player.ready,
      connected: player.connected,
      botDifficulty: player.botDifficulty,
      isHost: playerId === state.hostSessionId,
      isSelf: playerId === selfSessionId,
    });
  });

  const teams = TEAM_INDEXES.map((team): LobbyTeamView => {
    const members = players.filter((player) => player.team === team);
    const freeSlots = Math.max(0, MATCH_CONFIG.teamSize - members.length);
    return { team, slots: [...members, ...Array<null>(freeSlots).fill(null)] };
  });

  const self = players.find((player) => player.isSelf) ?? null;

  return {
    code: state.code,
    teams,
    playerCount: players.length,
    self,
    isHost: self?.isHost ?? false,
  };
}
