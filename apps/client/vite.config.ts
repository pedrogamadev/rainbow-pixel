import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // O CORS do servidor libera esta porta (CORS_ORIGINS). Se ela estiver ocupada, é melhor
    // falhar do que subir em outra e ter as chamadas recusadas.
    strictPort: true,
    // Endereços do Cloudflare Tunnel, para quando o cliente de desenvolvimento é exposto por ele.
    allowedHosts: ['.trycloudflare.com'],
  },
});
