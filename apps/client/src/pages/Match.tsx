import { useEffect, useMemo, useState } from 'react';
import { GameCanvas } from '../game/GameCanvas';
import type { GameHandle, PlayerInfo } from '../game/GameCanvas';
import { DebugOverlay } from '../game/debug/DebugOverlay';
import { MatchHud } from '../game/hud/MatchHud';
import { dismissLobbyNotice, endMatch, getGameSession, sendDevCommand } from '../lib/colyseus';
import { clientEnv } from '../lib/env';
import type { LobbyView } from '../lib/lobbyView';

interface MatchProps {
  readonly view: LobbyView;
  readonly reconnecting: boolean;
  /** Último aviso do servidor para uma ação recusada (por exemplo, teleporte na parede). */
  readonly notice: string | null;
  readonly onLeave: () => void;
}

/** Ferramenta de teste: só existe com VITE_DEV_TOOLS=true. */
const teleport = clientEnv.devTools
  ? (x: number, y: number) => sendDevCommand({ kind: 'teleport', x, y })
  : undefined;

/** Tela da partida: aberta enquanto a sala está na fase `match`. */
export function Match({ view, reconnecting, notice, onLeave }: MatchProps) {
  // A conexão de jogo é a mesma durante toda a partida, inclusive depois de reconectar.
  const [session] = useState(getGameSession);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [handle, setHandle] = useState<GameHandle | null>(null);

  const players = useMemo(
    () =>
      new Map<string, PlayerInfo>(
        view.players.map((player) => [player.playerId, { nickname: player.nickname }]),
      ),
    [view.players],
  );
  const nicknames = useMemo(
    () => new Map(view.players.map((player) => [player.playerId, player.nickname])),
    [view.players],
  );

  // F3 abre e fecha o overlay de debug, só com as ferramentas de teste ligadas.
  useEffect(() => {
    if (!clientEnv.devTools) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'F3') {
        event.preventDefault();
        setOverlayOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Correr é Ctrl, e Ctrl+W fecha a aba sem dar para impedir: o navegador pede confirmação.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <main className="match">
      <header className="match-bar">
        <span className="match-title">
          Sala <strong>{view.code}</strong> · {view.mapId}
        </span>
        {reconnecting && (
          <span className="info" role="status">
            Conexão caiu. Tentando reconectar...
          </span>
        )}
        {clientEnv.devTools && <span className="hint">F3: debug</span>}
        {notice !== null && (
          <button type="button" className="info notice" onClick={dismissLobbyNotice}>
            {notice}
          </button>
        )}
        <span className="match-actions">
          {view.isHost && (
            <button type="button" onClick={endMatch}>
              Encerrar partida
            </button>
          )}
          <button type="button" className="secondary" onClick={onLeave}>
            Sair da sala
          </button>
        </span>
      </header>

      {session === null ? (
        <p className="error">Sem conexão com a sala.</p>
      ) : (
        <GameCanvas
          session={session}
          mapId={view.mapId}
          players={players}
          showGhost={overlayOpen}
          onReady={setHandle}
          {...(teleport === undefined ? {} : { onTeleport: teleport })}
        />
      )}

      <MatchHud handle={handle} nicknames={nicknames} />
      {clientEnv.devTools && overlayOpen && <DebugOverlay handle={handle} />}
    </main>
  );
}
