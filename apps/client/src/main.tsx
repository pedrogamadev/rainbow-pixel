import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ConfigErrorScreen } from './components/StatusScreens';
import { startAuth } from './lib/auth';
import { envProblems } from './lib/env';
import { createAppRouter } from './router';
import './styles.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Elemento #root não encontrado em index.html.');
}
const root = createRoot(container);

if (envProblems.length > 0) {
  // Sem configuração não dá para falar com o Supabase nem com o servidor.
  root.render(
    <StrictMode>
      <ConfigErrorScreen problems={envProblems} />
    </StrictMode>,
  );
} else {
  startAuth();
  root.render(
    <StrictMode>
      <RouterProvider router={createAppRouter()} />
    </StrictMode>,
  );
}
