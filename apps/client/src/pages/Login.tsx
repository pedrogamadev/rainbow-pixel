import { DEV_SEED_USERS } from '@rainbow-pixel/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Screen } from '../components/Screen';
import { AUTH_MESSAGES, describeAuthError } from '../lib/authErrors';
import { clientEnv } from '../lib/env';
import { getSupabase } from '../lib/supabase';
import { ROUTES } from '../routes';

const DEV_PASSWORD_MISSING_MESSAGE =
  'Defina VITE_DEV_SEED_PASSWORD em apps/client/.env ou digite a senha das contas de teste no campo de senha.';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(signInEmail: string, signInPassword: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await getSupabase().auth.signInWithPassword({
        email: signInEmail,
        password: signInPassword,
      });
      // Com sucesso, a sessão muda e o roteador troca de tela sozinho.
      if (result.error !== null) {
        setError(describeAuthError(result.error));
      }
    } catch {
      setError(AUTH_MESSAGES.unavailable);
    } finally {
      setBusy(false);
    }
  }

  function signInAsDevUser(devEmail: string): void {
    const devPassword = clientEnv.devSeedPassword || password;
    if (devPassword === '') {
      setError(DEV_PASSWORD_MISSING_MESSAGE);
      return;
    }
    void signIn(devEmail, devPassword);
  }

  return (
    <Screen title="Entrar">
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn(email.trim(), password);
        }}
      >
        <label>
          E-mail
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <p>
        Ainda não tem conta? <Link to={ROUTES.register}>Criar conta</Link>
      </p>

      {clientEnv.devTools && (
        <section className="dev-tools">
          <h2>Ferramentas de teste</h2>
          <p className="hint">Contas criadas por pnpm dev:seed-users. Uma conta por aba.</p>
          <div className="actions">
            {DEV_SEED_USERS.map((user) => (
              <button
                key={user.email}
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => signInAsDevUser(user.email)}
              >
                Entrar como {user.nickname}
              </button>
            ))}
          </div>
        </section>
      )}
    </Screen>
  );
}
