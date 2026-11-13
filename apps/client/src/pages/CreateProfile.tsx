import { NICKNAME_CONFIG, NICKNAME_ERROR_MESSAGES, validateNickname } from '@rainbow-pixel/shared';
import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ApiError, createProfile } from '../lib/api';
import { loadProfile, setAuthProfile, signOut } from '../lib/auth';

const CREATE_FAILED_MESSAGE = 'Não foi possível criar o perfil. Tente de novo.';

export function CreateProfile() {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mesma regra que o servidor aplica (packages/shared).
  const validation = validateNickname(nickname);
  const hint = nickname === '' || validation.ok ? null : NICKNAME_ERROR_MESSAGES[validation.error];

  async function submit(): Promise<void> {
    if (!validation.ok) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setAuthProfile(await createProfile(nickname));
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'profile_exists') {
        // O perfil já foi criado (em outra aba, por exemplo): basta carregar.
        void loadProfile();
        return;
      }
      setError(caught instanceof ApiError ? caught.message : CREATE_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Criar perfil">
      <p>Escolha o nickname que os outros jogadores vão ver.</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          Nickname
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={NICKNAME_CONFIG.maxLength}
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value);
              setError(null);
            }}
          />
          <span className="hint">
            {NICKNAME_CONFIG.minLength} a {NICKNAME_CONFIG.maxLength} caracteres: letras sem acento,
            números e _.
          </span>
        </label>
        {hint !== null && <p className="error">{hint}</p>}
        <button type="submit" disabled={busy || !validation.ok}>
          {busy ? 'Criando perfil...' : 'Criar perfil'}
        </button>
      </form>

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
