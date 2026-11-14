// Overlay de debug (ferramenta de teste, escopo, seção 17). Só abre com VITE_DEV_TOOLS=true.

import { DEV_NET_SIMULATOR_CONFIG } from '@rainbow-pixel/shared';
import type { DevNetSettings } from '@rainbow-pixel/shared';
import { useEffect, useState } from 'react';
import { setDevNet } from '../../lib/colyseus';
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

export function DebugOverlay({ handle }: { readonly handle: GameHandle | null }) {
  const [stats, setStats] = useState<(GameStats & { readonly fps: number }) | null>(null);
  const [net, setNet] = useState<DevNetSettings>({ latencyMs: 0, jitterMs: 0, lossPct: 0 });
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (handle === null) {
      return;
    }
    const timer = setInterval(() => {
      setStats({ ...handle.game.stats(), fps: handle.fps() });
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
