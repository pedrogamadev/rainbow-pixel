import { Navigate, Outlet, createBrowserRouter } from 'react-router';
import { AuthErrorScreen, LoadingScreen } from './components/StatusScreens';
import { useAuth } from './lib/auth';
import { CreateProfile } from './pages/CreateProfile';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ROUTES } from './routes';

type SessionStage = 'signed_out' | 'needs_profile' | 'ready';

/** Tela inicial de cada etapa: Login -> CreateProfile -> Home. */
const STAGE_ROUTE: Readonly<Record<SessionStage, string>> = {
  signed_out: ROUTES.login,
  needs_profile: ROUTES.createProfile,
  ready: ROUTES.home,
};

/** Só mostra as telas filhas na etapa certa da sessão; fora dela, manda para a tela da etapa atual. */
function StageGuard({ stage }: { readonly stage: SessionStage }) {
  const auth = useAuth();
  if (auth.status === 'loading') {
    return <LoadingScreen message="Carregando..." />;
  }
  if (auth.status === 'error') {
    return <AuthErrorScreen message={auth.message} />;
  }
  if (auth.status !== stage) {
    return <Navigate to={STAGE_ROUTE[auth.status]} replace />;
  }
  return <Outlet />;
}

export function createAppRouter() {
  return createBrowserRouter([
    {
      element: <StageGuard stage="signed_out" />,
      children: [
        { path: ROUTES.login, element: <Login /> },
        { path: ROUTES.register, element: <Register /> },
      ],
    },
    {
      element: <StageGuard stage="needs_profile" />,
      children: [{ path: ROUTES.createProfile, element: <CreateProfile /> }],
    },
    {
      element: <StageGuard stage="ready" />,
      children: [
        { path: ROUTES.home, element: <Home /> },
        { path: ROUTES.lobbyPattern, element: <Lobby /> },
      ],
    },
    { path: '*', element: <Navigate to={ROUTES.home} replace /> },
  ]);
}
