import {
  BOT_DIFFICULTIES,
  MATCH_CONFIG,
  isValidRoomCode,
  normalizeRoomCode,
} from '@rainbow-pixel/shared';
import type { BotDifficultyId, TeamIndex } from '@rainbow-pixel/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Screen } from '../components/Screen';
import {
  addBot,
  dismissLobbyNotice,
  enterLobby,
  leaveLobby,
  removeBot,
  toggleReady,
  useLobby,
} from '../lib/colyseus';
import { LOBBY_MESSAGES } from '../lib/lobbyErrors';
import type { LobbyPlayerView } from '../lib/lobbyView';
import { ROUTES } from '../routes';

const BOT_DIFFICULTY_OPTIONS = BOT_DIFFICULTIES.filter((difficulty) => difficulty.enabled);

const COPY_FEEDBACK_MS = 2000;

type CopyStatus = 'idle' | 'copied' | 'failed';

/** Entra na sala; a falha fica no estado do lobby e aparece na tela. */
function requestEnter(code: string): void {
  enterLobby(code).catch(() => {});
}

interface AddBotControlProps {
  readonly team: TeamIndex;
  readonly disabled: boolean;
}

function AddBotControl({ team, disabled }: AddBotControlProps) {
  const [difficulty, setDifficulty] = useState<BotDifficultyId | undefined>(
    BOT_DIFFICULTY_OPTIONS[0]?.id,
  );
  if (difficulty === undefined) {
    return null;
  }
  return (
    <div className="add-bot">
      <select
        aria-label="Dificuldade do bot"
        value={difficulty}
        disabled={disabled}
        onChange={(event) => {
          const option = BOT_DIFFICULTY_OPTIONS.find((item) => item.id === event.target.value);
          if (option !== undefined) {
            setDifficulty(option.id);
          }
        }}
      >
        {BOT_DIFFICULTY_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        onClick={() => addBot(team, difficulty)}
      >
        Adicionar bot
      </button>
    </div>
  );
}

interface PlayerSlotProps {
  readonly player: LobbyPlayerView;
  readonly canRemove: boolean;
  readonly disabled: boolean;
}

function PlayerSlot({ player, canRemove, disabled }: PlayerSlotProps) {
  return (
    <li className={player.connected ? 'slot' : 'slot slot-offline'}>
      <div className="slot-main">
        <span className="slot-name">{player.nickname}</span>
        {player.kind === 'bot' && <span className="tag tag-bot">BOT</span>}
        {player.isHost && <span className="tag">Host</span>}
        {player.isSelf && <span className="tag tag-self">Você</span>}
      </div>
      <div className="slot-status">
        <span className={player.ready ? 'status status-ok' : 'status status-wait'}>
          {player.ready ? 'Pronto' : 'Não pronto'}
        </span>
        <span className={player.connected ? 'status status-ok' : 'status status-off'}>
          {player.connected ? 'Conectado' : 'Desconectado'}
        </span>
      </div>
      {canRemove && (
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => removeBot(player.playerId)}
        >
          Remover
        </button>
      )}
    </li>
  );
}

interface EmptySlotProps {
  readonly team: TeamIndex;
  readonly canAddBot: boolean;
  readonly disabled: boolean;
}

function EmptySlot({ team, canAddBot, disabled }: EmptySlotProps) {
  return (
    <li className="slot slot-empty">
      <span className="slot-name">Vaga livre</span>
      {canAddBot && <AddBotControl team={team} disabled={disabled} />}
    </li>
  );
}

export function Lobby() {
  const params = useParams<'code'>();
  const navigate = useNavigate();
  const lobby = useLobby();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [leaving, setLeaving] = useState(false);

  const code = normalizeRoomCode(params.code ?? '');
  const validCode = isValidRoomCode(code);

  // Cobre a chegada pela Home (a conexão já existe) e a página recarregada (reconecta com o
  // token salvo). Sair da sala é sempre um pedido explícito, nunca efeito de desmontar a tela.
  useEffect(() => {
    if (validCode) {
      requestEnter(code);
    }
  }, [code, validCode]);

  async function leave(): Promise<void> {
    setLeaving(true);
    await leaveLobby();
    await navigate(ROUTES.home);
  }

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
    setTimeout(() => setCopyStatus('idle'), COPY_FEEDBACK_MS);
  }

  const backButton = (
    <button type="button" className="secondary" onClick={() => void leave()}>
      Voltar
    </button>
  );

  if (!validCode) {
    return (
      <Screen title="Sala">
        <p className="error" role="alert">
          Código de sala inválido.
        </p>
        <div className="actions">{backButton}</div>
      </Screen>
    );
  }

  if (leaving) {
    return (
      <Screen title={`Sala ${code}`}>
        <p>Saindo da sala...</p>
      </Screen>
    );
  }

  // Até o efeito acima pedir a entrada, o estado ainda é de nenhuma sala.
  if (lobby.code !== code || lobby.status === 'idle' || lobby.status === 'connecting') {
    return (
      <Screen title={`Sala ${code}`}>
        <p>Entrando na sala...</p>
      </Screen>
    );
  }

  if (lobby.status === 'closed') {
    return (
      <Screen title={`Sala ${code}`}>
        <p className="error" role="alert">
          {lobby.error ?? LOBBY_MESSAGES.connectionLost}
        </p>
        <div className="actions">
          <button type="button" onClick={() => requestEnter(code)}>
            Tentar de novo
          </button>
          {backButton}
        </div>
      </Screen>
    );
  }

  const view = lobby.view;
  if (view === null) {
    return (
      <Screen title={`Sala ${code}`}>
        <p>Entrando na sala...</p>
      </Screen>
    );
  }

  const reconnecting = lobby.status === 'reconnecting';

  return (
    <Screen title="Lobby" wide>
      <section className="room-code">
        <span className="room-code-label">Código da sala</span>
        <strong className="room-code-value">{view.code}</strong>
        <button type="button" className="secondary" onClick={() => void copyCode()}>
          {copyStatus === 'copied' ? 'Copiado!' : 'Copiar código'}
        </button>
        {copyStatus === 'failed' && (
          <span className="hint">Não deu para copiar. Selecione o código e copie.</span>
        )}
      </section>

      {reconnecting && (
        <p className="info" role="status">
          Conexão caiu. Tentando reconectar...
        </p>
      )}

      {lobby.notice !== null && (
        <p className="error notice" role="alert">
          <span>{lobby.notice}</span>
          <button type="button" className="secondary" onClick={dismissLobbyNotice}>
            Fechar
          </button>
        </p>
      )}

      <p>
        Jogadores: {view.playerCount}/{MATCH_CONFIG.maxPlayers}
      </p>

      <div className="teams">
        {view.teams.map((team) => (
          <section key={team.team} className="team">
            <h2>Time {team.team + 1}</h2>
            <ul className="slots">
              {team.slots.map((slot, index) =>
                slot === null ? (
                  <EmptySlot
                    // Vaga livre não tem id; a posição no time basta.
                    key={`free-${index}`}
                    team={team.team}
                    canAddBot={view.isHost}
                    disabled={reconnecting}
                  />
                ) : (
                  <PlayerSlot
                    key={slot.playerId}
                    player={slot}
                    canRemove={view.isHost && slot.kind === 'bot'}
                    disabled={reconnecting}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>

      <div className="actions">
        <button type="button" disabled={reconnecting || view.self === null} onClick={toggleReady}>
          {view.self?.ready === true ? 'Cancelar pronto' : 'Pronto'}
        </button>
        <button type="button" className="secondary" onClick={() => void leave()}>
          Sair
        </button>
      </div>
    </Screen>
  );
}
