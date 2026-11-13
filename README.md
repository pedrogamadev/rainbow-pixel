# Rainbow Pixel

Jogo de tiro tático 2D multiplayer no navegador. Partidas 2v2 com paredes destrutíveis, drones, câmeras e som posicional. Bots completam a sala quando faltam jogadores.

Status: em desenvolvimento, marco 0.1 (Fundação).

## Stack

- TypeScript em todo o projeto (monorepo com pnpm workspaces)
- Cliente: Vite, React e PixiJS
- Servidor: Node.js, Colyseus e Express
- Banco e autenticação: PostgreSQL e Auth no Supabase, via Prisma

## Documentação

- Escopo da versão 1.0 (fonte da verdade): [docs/rainbow-pixel-escopo-1.0.md](docs/rainbow-pixel-escopo-1.0.md)
- Marcos: [docs/marcos](docs/marcos)
- Instruções para agentes de IA: [AGENTS.md](AGENTS.md)

## Rodando localmente

As instruções de instalação e execução serão adicionadas no marco 0.1.

## Roadmap

| Marco | Entrega | Bot |
|---|---|---|
| 0.1 | Fundação: monorepo, CI, login, perfil, sala por código | Bots no lobby, sem comportamento |
| 0.2 | Movimento em rede e mapa importado do Tiled | Nível 0: boneco |
| 0.3 | Tiro hitscan e compensação de lag | Nível 1: atirador |
| 0.4 | Destruição de parede, breach, reforço e barricada | Nível 2: navegação |
| 0.5 | Visão, fog of war e som | Nível 2: investiga som |
| 0.6 | Modo Bomba completo | Nível 3: objetivo |
| 0.7 | Drones, câmeras e espectador | Atira em drone e câmera |
| 0.8 | Arsenal e loadout | Sorteia loadout |
| 0.9 | Conta, stats, histórico e XP | Partida com bot não conta |
| 1.0 | Polimento e produção | Balanceamento das dificuldades |
