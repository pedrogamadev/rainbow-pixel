import { createCollisionGrid, getMap } from '@rainbow-pixel/maps';
import { Application, Container } from 'pixi.js';
import { useEffect, useRef } from 'react';
import type { GameSession } from '../lib/colyseus';
import { GameClient } from './GameClient';
import { KeyboardMouseInput } from './input';
import { createMapGraphics } from './render/mapView';
import { BACKGROUND_COLOR } from './render/palette';
import { PlayersView, createGhost } from './render/playersView';
import type { DrawnPlayer } from './render/playersView';

/** O que a tela da partida sabe de cada jogador pelo lobby. O time vem do snapshot. */
export interface PlayerInfo {
  readonly nickname: string;
}

/** O que o overlay de debug lê da partida. */
export interface GameHandle {
  readonly game: GameClient;
  readonly fps: () => number;
}

interface GameCanvasProps {
  readonly session: GameSession;
  readonly mapId: string;
  /** Nickname de cada jogador, pelo playerId (vem do estado da sala). */
  readonly players: ReadonlyMap<string, PlayerInfo>;
  /** Desenha o fantasma da posição confirmada pelo servidor (overlay de debug). */
  readonly showGhost: boolean;
  /** Recebe a partida quando ela começa a ser desenhada, e `null` ao sair. */
  readonly onReady?: (handle: GameHandle | null) => void;
}

const UNKNOWN_PLAYER: PlayerInfo = { nickname: '' };

/** Partida em PixiJS: mapa, jogadores e câmera seguindo o próprio jogador. */
export function GameCanvas({ session, mapId, players, showGhost, onReady }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // O laço de desenho lê a versão mais nova destes valores sem recriar a partida.
  const playersRef = useRef(players);
  const showGhostRef = useRef(showGhost);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    playersRef.current = players;
    showGhostRef.current = showGhost;
    onReadyRef.current = onReady;
  }, [players, showGhost, onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const map = getMap(mapId);
    const game = new GameClient({
      transport: session.transport,
      map: createCollisionGrid(map),
      selfId: session.selfId,
      now: () => performance.now(),
    });
    const stopReconnect = session.onReconnect(() => game.resetInputs());

    const app = new Application();
    let ready = false;
    let disposed = false;
    let input: KeyboardMouseInput | null = null;

    app
      .init({ resizeTo: host, background: BACKGROUND_COLOR, antialias: true })
      .then(() => {
        ready = true;
        // O componente pode ter saído da tela enquanto o PixiJS iniciava.
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
        const world = new Container();
        const playersView = new PlayersView();
        const ghost = createGhost();
        world.addChild(createMapGraphics(map), playersView.container, ghost);
        app.stage.addChild(world);
        const keyboard = new KeyboardMouseInput(app.canvas);
        input = keyboard;

        app.ticker.add(() => {
          const center = { x: app.screen.width / 2, y: app.screen.height / 2 };
          // A câmera centraliza o próprio jogador: na tela, ele está sempre no centro.
          game.update((self) => keyboard.sample(self === null ? null : center));

          const drawn: DrawnPlayer[] = game.renderOthers().map((other) => ({
            ...other,
            ...(playersRef.current.get(other.playerId) ?? UNKNOWN_PLAYER),
            isSelf: false,
          }));
          const self = game.renderSelf();
          if (self !== null) {
            drawn.push({
              ...self,
              ...(playersRef.current.get(self.playerId) ?? UNKNOWN_PLAYER),
              isSelf: true,
            });
            world.position.set(Math.round(center.x - self.x), Math.round(center.y - self.y));
          }
          playersView.update(drawn);

          const confirmed = game.serverSelf();
          ghost.visible = showGhostRef.current && confirmed !== null;
          if (confirmed !== null) {
            ghost.position.set(confirmed.x, confirmed.y);
          }
        });
        onReadyRef.current?.({ game, fps: () => app.ticker.FPS });
      })
      .catch((error: unknown) => {
        console.error('[game] falha ao iniciar o PixiJS', error);
      });

    return () => {
      disposed = true;
      stopReconnect();
      input?.dispose();
      game.dispose();
      onReadyRef.current?.(null);
      if (ready) {
        app.destroy(true, { children: true });
      }
    };
  }, [session, mapId]);

  return <div ref={hostRef} className="game-canvas" />;
}
