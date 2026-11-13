import { ROOM_CODE_CONFIG, isValidRoomCode, normalizeRoomCode } from '@rainbow-pixel/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Screen } from '../components/Screen';
import { signOut, useAuth } from '../lib/auth';
import { LobbyError, createLobby, enterLobby, leaveLobby } from '../lib/colyseus';
import { LOBBY_MESSAGES } from '../lib/lobbyErrors';
import { ROUTES } from '../routes';

const INVALID_CODE_MESSAGE = `O código da sala tem ${ROOM_CODE_CONFIG.length} caracteres, com letras e números.`;

function describeLobbyFailure(error: unknown): string {
  return error instanceof LobbyError ? error.message : LOBBY_MESSAGES.joinFailed;
}

export function Home() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [codeInput, setCodeInput] = useState('');
  const [pending, setPending] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Quem volta do lobby pelo botão Voltar do navegador também libera a vaga.
  useEffect(() => {
    void leaveLobby();
  }, []);

  if (auth.status !== 'ready') {
    return null;
  }

  async function createRoom(): Promise<void> {
    setPending('create');
    setError(null);
    try {
      const code = await createLobby();
      await navigate(ROUTES.lobby(code));
    } catch (caught) {
      setError(describeLobbyFailure(caught));
    } finally {
      setPending(null);
    }
  }

  async function joinRoom(): Promise<void> {
    const code = normalizeRoomCode(codeInput);
    if (!isValidRoomCode(code)) {
      setError(INVALID_CODE_MESSAGE);
      return;
    }
    setPending('join');
    setError(null);
    try {
      await enterLobby(code);
      await navigate(ROUTES.lobby(code));
    } catch (caught) {
      setError(describeLobbyFailure(caught));
      // Descarta o estado da tentativa: o erro já está nesta tela.
      void leaveLobby();
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <Screen title="Início">
      <p>
        Jogando como <strong>{auth.profile.nickname}</strong> · nível {auth.profile.level}
      </p>

      <section className="panel">
        <h2>Partida rápida 2v2</h2>
        <button type="button" disabled={busy} onClick={() => void createRoom()}>
          {pending === 'create' ? 'Criando sala...' : 'Criar sala'}
        </button>
      </section>

      <section className="panel">
        <h2>Entrar com código</h2>
        <form
          className="form form-inline"
          onSubmit={(event) => {
            event.preventDefault();
            void joinRoom();
          }}
        >
          <label>
            Código da sala
            <input
              type="text"
              className="code-input"
              autoComplete="off"
              spellCheck={false}
              maxLength={ROOM_CODE_CONFIG.length}
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
            />
          </label>
          <button type="submit" disabled={busy}>
            {pending === 'join' ? 'Entrando...' : 'Entrar com código'}
          </button>
        </form>
      </section>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="button" className="secondary" onClick={() => void signOut()}>
          Sair da conta
        </button>
      </div>
    </Screen>
  );
}
