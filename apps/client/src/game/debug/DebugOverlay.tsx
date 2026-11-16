// Overlay de debug (ferramenta de teste, escopo, seção 17). Só abre com VITE_DEV_TOOLS=true.

import { DEV_NET_SIMULATOR_CONFIG, LAG_COMP_CONFIG } from '@rainbow-pixel/shared';
import type { DevFlags, DevNetSettings } from '@rainbow-pixel/shared';
import { useEffect, useState } from 'react';
import { sendDevCommand, setDevNet } from '../../lib/colyseus';
import type { GameHandle } from '../GameCanvas';
import type { GameStats } from '../GameClient';

const REFRESH_MS = 250;

interface NetField {
  readonly key: keyof DevNetSettings;
  readonly label: string;
  readonly max: number;
}

const NET_FIELDS: readonly NetField[] = [
  { key: 'latencyMs', label: 'Atraso (ms)', max: DEV_NET_SIMULATOR_CONFIG.maxLatencyMs },
  { key: 'jitterMs', label: 'Variação (ms)', max: DEV_NET_SIMULATOR_CONFIG.maxJitterMs },
  { key: 'lossPct', label: 'Perda (%)', max: DEV_NET_SIMULATOR_CONFIG.maxLossPct },
];

function format(value: number | null, digits = 0): string {
  return value === null ? '-' : value.toFixed(digits);
}

function formatRatio(value: number | null): string {
  return value === null ? '-' : `${(value * 100).toFixed(1)}%`;
}

export function DebugOverlay({ handle }: { readonly handle: GameHandle | null }) {
  const [stats, setStats] = useState<(GameStats & { readonly fps: number }) | null>(null);
  const [dev, setDev] = useState<DevFlags | null>(null);
  const [net, setNet] = useState<DevNetSettings>({ latencyMs: 0, jitterMs: 0, lossPct: 0 });
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (handle === null) {
      return;
    }
    const timer = setInterval(() => {
      setStats({ ...handle.game.stats(), fps: handle.fps() });
      setDev(handle.game.lastSelf()?.dev ?? null);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [handle]);

  function applyNet(): void {
    setDevNet(net);
    setApplied(true);
  }

  return (
    <aside className="debug-overlay" aria-label="Debug">
      <h2>Debug (F3)</h2>
      <dl>
        <dt>FPS</dt>
        <dd>{format(stats?.fps ?? null)}</dd>
        <dt>RTT</dt>
        <dd>{format(stats?.rttMs ?? null)} ms</dd>
        <dt>Tick do servidor</dt>
        <dd>{stats?.serverTick ?? '-'}</dd>
        <dt>Buffer de interpolação</dt>
        <dd>
          {stats === null
            ? '-'
            : `${stats.interpolationAhead} à frente / ${stats.interpolationSize}`}
        </dd>
        <dt>Inputs pendentes</dt>
        <dd>{stats?.pendingInputs ?? '-'}</dd>
        <dt>Correções por segundo</dt>
        <dd>{stats?.correctionsPerSecond ?? '-'}</dd>
        <dt>Última correção</dt>
        <dd>{format(stats?.lastCorrectionPx ?? null, 2)} px</dd>
      </dl>
      <p className="hint">Círculo verde: posição confirmada pelo servidor.</p>

      <h3>Tiro</h3>
      <dl>
        <dt>Volta estimada</dt>
        <dd>{format(stats?.rewindEstimateMs ?? null)} ms</dd>
        <dt>Disparos</dt>
        <dd>{stats?.shotsFired ?? '-'}</dd>
        <dt>Acertos previstos</dt>
        <dd>{stats?.localHits ?? '-'}</dd>
        <dt>Acertos confirmados</dt>
        <dd>{stats?.confirmedHits ?? '-'}</dd>
        <dt>Confirmados / previstos</dt>
        <dd>{formatRatio(stats?.hitRegRatio ?? null)}</dd>
      </dl>
      <p className="hint">
        Volta = hora de chegada do input no servidor - viewTimeMs. O servidor volta no máximo{' '}
        {LAG_COMP_CONFIG.maxRewindMs} ms.
      </p>

      <div className="debug-commands">
        <h3>Comandos</h3>
        <button
          type="button"
          className="secondary"
          aria-pressed={dev?.god ?? false}
          onClick={() => sendDevCommand({ kind: 'god', enabled: !(dev?.god ?? false) })}
        >
          Vida infinita: {dev?.god === true ? 'ligada' : 'desligada'}
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={dev?.noSpread ?? false}
          onClick={() => sendDevCommand({ kind: 'no_spread', enabled: !(dev?.noSpread ?? false) })}
        >
          Dispersão zero: {dev?.noSpread === true ? 'ligada' : 'desligada'}
        </button>
        <p className="hint">T: teleporta para o ponto sob o mouse.</p>
      </div>

      <form
        className="debug-net"
        onSubmit={(event) => {
          event.preventDefault();
          applyNet();
        }}
      >
        <h3>Simulador de lag</h3>
        {NET_FIELDS.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              type="number"
              min={0}
              max={field.max}
              step="any"
              value={net[field.key]}
              onChange={(event) => {
                const value = Math.min(field.max, Math.max(0, Number(event.target.value) || 0));
                setNet((current) => ({ ...current, [field.key]: value }));
                setApplied(false);
              }}
            />
          </label>
        ))}
        <button type="submit" className="secondary">
          {applied ? 'Aplicado' : 'Aplicar'}
        </button>
      </form>
    </aside>
  );
}
