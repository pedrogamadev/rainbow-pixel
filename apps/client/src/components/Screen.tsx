import type { ReactNode } from 'react';

interface ScreenProps {
  readonly title: string;
  /** Telas com mais conteúdo, como o lobby, usam a largura maior. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}

/** Moldura comum das telas de menu. */
export function Screen({ title, wide = false, children }: ScreenProps) {
  return (
    <main className={wide ? 'screen screen-wide' : 'screen'}>
      <p className="brand">Rainbow Pixel</p>
      <section className="card">
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
