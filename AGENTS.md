# AGENTS.md

Instruções para agentes de IA (Codex, Cursor, Claude Code e similares) que trabalham neste repositório. Leia este arquivo inteiro antes de qualquer alteração.

## 1. Contexto do projeto

Rainbow Pixel é um jogo de tiro tático 2D, visto de cima, jogado no navegador, em partidas online 2v2, inspirado em Rainbow Six Siege. Os pilares são destruição de parede, informação (drones, câmeras, som) e jogo de time atacante contra defensor.

## 2. Fonte da verdade

- Escopo da versão 1.0: `docs/rainbow-pixel-escopo-1.0.md`.
- Tarefa do marco atual: `docs/marcos/<marco>.md`.
- Ordem de prioridade em caso de conflito: (1) arquivo do marco atual, (2) escopo da 1.0, (3) este arquivo, (4) qualquer outra fonte.
- Se uma instrução for ambígua ou contraditória, pare e descreva a dúvida no resumo final. Não invente regra de jogo.

## 3. Regras de escopo

- Implemente somente o que o arquivo do marco atual pede.
- Não implemente nada listado na seção 13 (Fora do escopo) do documento de escopo.
- Não antecipe funcionalidades de marcos futuros. Pastas reservadas para marcos futuros recebem no máximo um README ou um index.ts vazio.
- Valores de balanceamento (dano, tempos, raios, XP) ficam em `packages/shared/src/config`. Nunca espalhe números mágicos pelo código.
- Catálogos (modos, operadores, armas, gadgets) ficam em `packages/shared/src/catalog`. O banco guarda apenas os ids desses catálogos.

## 4. Regras de arquitetura

- O servidor é autoritativo. Toda regra de jogo roda no servidor.
- A simulação (`packages/shared/src/sim`) é TypeScript puro: sem DOM, sem PixiJS, sem Colyseus, sem Node APIs. Ela é importada pelo servidor e pelo cliente.
- O cliente apenas renderiza, captura input e faz previsão do próprio movimento.
- Nunca envie ao cliente dados que o jogador não deveria ver (posição de inimigo fora da visão, eventos de som fora do raio, marcações do outro time).
- O servidor de jogo não grava no banco durante a partida. Gravação somente no fim da partida, em transação.
- Autenticação: o servidor valida o JWT do Supabase em toda rota protegida e no onAuth das salas. Nunca confie em ids enviados pelo cliente.
- Bots (seção 16 do escopo): o cérebro fica em `packages/bots`, em TypeScript puro. Um bot recebe somente a `PlayerView` filtrada que um cliente humano receberia e devolve um `InputCommand` que passa pelas mesmas validações. Bot nunca lê o estado completo da partida e nunca grava no banco.
- Ferramentas de teste (seção 17 do escopo) ficam atrás de `DEV_TOOLS=true` e nunca podem rodar com `NODE_ENV=production`. Chave secreta do Supabase existe somente no servidor.

## 5. Stack

- pnpm workspaces, Node.js 24 LTS, TypeScript strict.
- Servidor: Colyseus sobre Express, Prisma, PostgreSQL (Supabase), Supabase Auth.
- Cliente: Vite, React (menus), PixiJS (jogo).
- Testes: Vitest. Lint e formatação: ESLint e Prettier.
- Não adicione dependências fora desta lista sem justificar no resumo final.

## 6. Qualidade

- Todo código novo em `packages/shared` e `packages/bots` precisa de teste unitário. Comportamento de bot é testado por cenários: situação montada, comando esperado.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` devem passar antes de concluir.
- Migrations do Prisma são geradas e versionadas. Nunca edite uma migration já aplicada; crie outra.
- Nunca use `any` sem comentário explicando o motivo.
- Nunca commite segredos. Toda variável nova entra no `.env.example` correspondente.

## 7. Convenções

- Código, nomes de arquivos, variáveis e identificadores em inglês.
- Textos da interface, documentação e mensagens de commit em português (PT-BR).
- Commits seguem Conventional Commits em PT-BR, por exemplo: `feat(server): adiciona sala quick_match com código`.
- Um marco por branch: `marco/0.1-fundacao`, `marco/0.2-movimento` etc.

## 8. Entrega de cada tarefa

Ao concluir, responda com:
1. Lista de arquivos criados e alterados.
2. Comandos para rodar localmente.
3. Status de cada critério de aceite do marco (atendido, parcial, não atendido) com evidência.
4. Tarefas manuais que dependem do responsável humano (painéis, chaves, contas).
5. Dúvidas ou decisões tomadas que não estavam no escopo.
