import { Application } from 'pixi.js';
import { useEffect, useRef } from 'react';

const PLACEHOLDER_WIDTH = 640;
const PLACEHOLDER_HEIGHT = 360;
const PLACEHOLDER_BACKGROUND = 0x14161c;

/**
 * Placeholder do canvas do jogo: só sobe o PixiJS com uma tela vazia.
 * Ainda não é usado por nenhuma tela; o jogo começa no marco 0.2.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const app = new Application();
    let ready = false;
    let disposed = false;

    app
      .init({
        width: PLACEHOLDER_WIDTH,
        height: PLACEHOLDER_HEIGHT,
        background: PLACEHOLDER_BACKGROUND,
      })
      .then(() => {
        ready = true;
        // O componente pode ter saído da tela enquanto o PixiJS iniciava.
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
      })
      .catch((error: unknown) => {
        console.error('[game] falha ao iniciar o PixiJS', error);
      });

    return () => {
      disposed = true;
      if (ready) {
        app.destroy(true);
      }
    };
  }, []);

  return <div ref={hostRef} className="game-canvas" />;
}
