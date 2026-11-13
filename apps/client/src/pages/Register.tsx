import { useState } from 'react';
import { Link } from 'react-router';
import { Screen } from '../components/Screen';
import { AUTH_MESSAGES, AUTH_PASSWORD_MIN_LENGTH, describeAuthError } from '../lib/authErrors';
import { getSupabase } from '../lib/supabase';
import { ROUTES } from '../routes';

const CONFIRM_EMAIL_MESSAGE =
  'Conta criada. Abra o link de confirmação enviado para o seu e-mail e depois faça login.';

export function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function signUp(): Promise<void> {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await getSupabase().auth.signUp({ email: email.trim(), password });
      if (result.error !== null) {
        setError(describeAuthError(result.error));
      } else if (result.data.session === null) {
        // O projeto do Supabase está exigindo confirmação de e-mail: ainda não há sessão.
        setInfo(CONFIRM_EMAIL_MESSAGE);
      }
      // Com sessão, o roteador segue sozinho para a criação de perfil.
    } catch {
      setError(AUTH_MESSAGES.unavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Criar conta">
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void signUp();
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
            autoComplete="new-password"
            required
            minLength={AUTH_PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="hint">Pelo menos {AUTH_PASSWORD_MIN_LENGTH} caracteres.</span>
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {info !== null && <p className="info">{info}</p>}

      <p>
        Já tem conta? <Link to={ROUTES.login}>Entrar</Link>
      </p>
    </Screen>
  );
}
