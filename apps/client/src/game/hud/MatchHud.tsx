// HUD mínimo da partida (marco 0.3): vida, arma, munição, barras de recarga e de troca, feed de
// abates e tela de morte com a contagem até renascer. O HUD final é do marco 1.0.

import { useEffect, useState } from 'react';
import type { GameHandle } from '../GameCanvas';
import { buildHudState } from './hudState';
import type { HudState } from './hudState';

const REFRESH_MS = 100;

interface MatchHudProps {
  readonly handle: GameHandle | null;
  /** Nickname de cada jogador, pelo playerId. */
  readonly nicknames: ReadonlyMap<string, string>;
}

function Bar({ label, progress }: { readonly label: string; readonly progress: number }) {
  return (
    <div className="hud-bar" role="progressbar" aria-label={label} aria-valuenow={progress}>
      <span>{label}</span>
      <div className="hud-bar-track">
        <div className="hud-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}

export function MatchHud({ handle, nicknames }: MatchHudProps) {
  const [hud, setHud] = useState<HudState | null>(null);

  useEffect(() => {
    if (handle === null) {
      return;
    }
    const { game, effects } = handle;
    const refresh = () => {
      setHud(
        buildHudState(
          game.predictedSelf(),
          game.lastSelf(),
          effects.killFeed(performance.now()),
          game.selfId,
          (playerId) => nicknames.get(playerId) ?? '?',
        ),
      );
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [handle, nicknames]);

  if (hud === null) {
    return null;
  }

  return (
    <>
      <section className="match-hud" aria-label="HUD">
        <div className="hud-health" aria-label="Vida">
          <span className="hud-label">Vida</span>
          <strong>{hud.health}</strong>
        </div>
        <div className="hud-weapon">
          <span className="hud-label">{hud.weaponName}</span>
          <strong>
            {hud.ammo} / {hud.magazine}
          </strong>
          {hud.reloadProgress !== null && (
            <Bar label="Recarregando" progress={hud.reloadProgress} />
          )}
          {hud.switchProgress !== null && <Bar label="Trocando" progress={hud.switchProgress} />}
        </div>
      </section>

      {hud.killFeed.length > 0 && (
        <ol className="kill-feed" aria-label="Abates">
          {hud.killFeed.map((kill) => (
            <li key={kill.eventId} className={kill.involvesSelf ? 'self' : undefined}>
              <strong>{kill.killer}</strong> <span className="hud-label">[{kill.weapon}]</span>{' '}
              <strong>{kill.victim}</strong>
            </li>
          ))}
        </ol>
      )}

      {!hud.alive && (
        <div className="death-screen" role="status">
          <strong>Você morreu</strong>
          {hud.respawnSeconds !== null && <span>Renascendo em {hud.respawnSeconds} s</span>}
        </div>
      )}
    </>
  );
}
