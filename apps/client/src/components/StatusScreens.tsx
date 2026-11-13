import { loadProfile, signOut } from '../lib/auth';
import { Screen } from './Screen';

export function LoadingScreen({ message }: { readonly message: string }) {
  return (
    <Screen title="Aguarde">
      <p>{message}</p>
    </Screen>
  );
}

/** Mostrada no lugar do app quando falta alguma variável em apps/client/.env. */
export function ConfigErrorScreen({ problems }: { readonly problems: readonly string[] }) {
  return (
    <Screen title="Configuração incompleta">
      <p>
        Confira o arquivo <code>apps/client/.env</code> (modelo em <code>.env.example</code>) e
        reinicie o cliente.
      </p>
      <ul className="problem-list">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </Screen>
  );
}

/** O jogador está logado, mas o servidor não devolveu o perfil. */
export function AuthErrorScreen({ message }: { readonly message: string }) {
  return (
    <Screen title="Não foi possível continuar">
      <p className="error" role="alert">
        {message}
      </p>
      <div className="actions">
        <button type="button" onClick={() => void loadProfile()}>
          Tentar de novo
        </button>
        <button type="button" className="secondary" onClick={() => void signOut()}>
          Sair da conta
        </button>
      </div>
    </Screen>
  );
}
