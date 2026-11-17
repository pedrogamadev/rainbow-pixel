import { createCollisionGrid, getMap } from '@rainbow-pixel/maps';
import { Application, Container } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import type { GameSession } from '../lib/colyseus';
import { GameClient } from './GameClient';
import { screenToWorld, viewRotation } from './camera';
import type { Camera } from './camera';
import { KeyboardMouseInput } from './input';
import { CrosshairView, DamageIndicatorView, TracersView } from './render/combatView';
import { createMapGraphics } from './render/mapView';
import { BACKGROUND_COLOR } from './render/palette';
import { PlayersView, createGhost } from './render/playersView';
import type { DrawnPlayer } from './render/playersView';
import { ShotEffects } from './shots';

/** O que a tela da partida sabe de cada jogador pelo lobby. O time vem do snapshot. */
export interface PlayerInfo {
  readonly nickname: string;
}

/** O que o HUD e o overlay de debug leem da partida. */
export interface GameHandle {
  readonly game: GameClient;
  readonly effects: ShotEffects;
  readonly fps: () => number;
}

interface GameCanvasProps {
  readonly session: GameSession;
  readonly mapId: string;
  /** Nickname de cada jogador, pelo playerId (vem do estado da sala). */
  readonly players: ReadonlyMap<string, PlayerInfo>;
  /** Desenha o fantasma da posição confirmada pelo servidor (overlay de debug). */
  readonly showGhost: boolean;
  /**
   * Ferramenta de teste: com a função, a tecla T teleporta para o ponto do mapa sob o mouse
   * solto (Esc). Sem ela (VITE_DEV_TOOLS desligado), a tecla não faz nada.
   */
  readonly onTeleport?: (x: number, y: number) => void;
  /** Recebe a partida quando ela começa a ser desenhada, e `null` ao sair. */
  readonly onReady?: (handle: GameHandle | null) => void;
}

const UNKNOWN_PLAYER: PlayerInfo = { nickname: '' };

/**
 * Partida em PixiJS: mapa, jogadores e tiros. A câmera segue o próprio jogador e gira o mapa com
 * a mira, que fica sempre para cima na tela.
 */
export function GameCanvas({
  session,
  mapId,
  players,
  showGhost,
  onTeleport,
  onReady,
}: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [aimLocked, setAimLocked] = useState(false);
  // O laço de desenho lê a versão mais nova destes valores sem recriar a partida.
  const playersRef = useRef(players);
  const showGhostRef = useRef(showGhost);
  const onTeleportRef = useRef(onTeleport);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    playersRef.current = players;
    showGhostRef.current = showGhost;
    onTeleportRef.current = onTeleport;
    onReadyRef.current = onReady;
  }, [players, showGhost, onTeleport, onReady]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const map = getMap(mapId);
    const now = () => performance.now();
    const game = new GameClient({
      transport: session.transport,
      map: createCollisionGrid(map),
      selfId: session.selfId,
      now,
    });
    const effects = new ShotEffects(session.selfId);
    const stopShots = game.onLocalShot((shot, at) =>
      effects.addLocalShot(shot.origin, shot.end, at),
    );
    const stopEvents = game.onEvent((event, at) => effects.onEvent(event, at));
    const stopReconnect = session.onReconnect(() => game.resetInputs());

    const app = new Application();
    let ready = false;
    let disposed = false;
    let input: KeyboardMouseInput | null = null;
    let stopAimLock: (() => void) | null = null;
    /** Câmera do último quadro desenhado. */
    let camera: Camera | null = null;
    const world = new Container();

    // T: teleporte para o ponto do mapa sob o mouse solto (ferramenta de teste).
    const onKeyDown = (event: KeyboardEvent) => {
      const teleport = onTeleportRef.current;
      const pointer = input?.pointerPosition() ?? null;
      if (
        event.code !== 'KeyT' ||
        event.repeat ||
        teleport === undefined ||
        pointer === null ||
        camera === null
      ) {
        return;
      }
      const target = screenToWorld(camera, pointer);
      teleport(target.x, target.y);
    };
    window.addEventListener('keydown', onKeyDown);

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
        const playersView = new PlayersView();
        const ghost = createGhost();
        const tracers = new TracersView();
        const crosshair = new CrosshairView();
        const damage = new DamageIndicatorView();
        world.addChild(
          createMapGraphics(map),
          tracers.graphics,
          playersView.container,
          ghost,
          crosshair.graphics,
        );
        app.stage.addChild(world, damage.graphics);
        const keyboard = new KeyboardMouseInput(app.canvas);
        input = keyboard;
        stopAimLock = keyboard.onAimLockChange(setAimLocked);

        app.ticker.add(() => {
          const center = {
            x: Math.round(app.screen.width / 2),
            y: Math.round(app.screen.height / 2),
          };
          game.update(() => keyboard.sample());
          const at = now();
          // A câmera gira com a mira do mouse a cada quadro, sem esperar o tick de 30 Hz.
          const aim = keyboard.currentAim();
          const rotation = viewRotation(aim);

          const drawn: DrawnPlayer[] = game.renderOthers().map((other) => ({
            ...other,
            ...(playersRef.current.get(other.playerId) ?? UNKNOWN_PLAYER),
            isSelf: false,
          }));
          const self = game.renderSelf();
          // Correndo, a mira fica presa na direção do movimento (regra da simulação). Fora isso,
          // o próprio jogador aponta para a mira do mouse, a mesma da câmera: para cima na tela.
          const selfAim =
            self !== null && game.predictedSelf()?.moveMode === 'run' ? self.aimAngle : aim;
          if (self !== null) {
            drawn.push({
              ...self,
              aimAngle: selfAim,
              ...(playersRef.current.get(self.playerId) ?? UNKNOWN_PLAYER),
              isSelf: true,
            });
            // O próprio jogador fica no centro da tela, e o mundo gira em volta dele.
            camera = { center, focus: { x: self.x, y: self.y }, rotation };
            world.pivot.set(self.x, self.y);
            world.position.set(center.x, center.y);
            world.rotation = rotation;
          }
          playersView.update(drawn, rotation);
          tracers.update(effects.tracers(at));

          const spread = game.aimSpread();
          crosshair.update(
            self === null || !self.alive || spread === null
              ? null
              : { origin: self, aimAngle: selfAim, ...spread, hit: effects.hitMarker(at) },
          );
          damage.update(effects.damageIndicators(at), self, center, app.screen, rotation);

          const confirmed = game.serverSelf();
          ghost.visible = showGhostRef.current && confirmed !== null;
          if (confirmed !== null) {
            ghost.position.set(confirmed.x, confirmed.y);
          }
        });
        onReadyRef.current?.({ game, effects, fps: () => app.ticker.FPS });
      })
      .catch((error: unknown) => {
        console.error('[game] falha ao iniciar o PixiJS', error);
      });

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      stopShots();
      stopEvents();
      stopReconnect();
      stopAimLock?.();
      input?.dispose();
      game.dispose();
      onReadyRef.current?.(null);
      if (ready) {
        app.destroy(true, { children: true });
      }
    };
  }, [session, mapId]);

  return (
    <div className="game-canvas">
      <div ref={hostRef} className="game-canvas-host" />
      {!aimLocked && (
        <p className="aim-hint" role="status">
          Clique no jogo para controlar a mira com o mouse. Esc solta o cursor.
        </p>
      )}
    </div>
  );
}
