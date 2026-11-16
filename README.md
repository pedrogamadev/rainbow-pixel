# Rainbow Pixel

Jogo de tiro tático 2D multiplayer no navegador. Partidas 2v2 com paredes destrutíveis, drones, câmeras e som posicional. Bots completam a sala quando faltam jogadores.

Status: em desenvolvimento, marco 0.2 (Movimento). Além do login, perfil, sala por código e lobby com bots do marco 0.1, a sala já vira partida: os 4 jogadores (humanos ou bots) andam no mapa de teste `gym_01`, com servidor autoritativo a 30 Hz, previsão e reconciliação do próprio movimento e interpolação dos outros. Ainda não há tiro.

## Stack

- TypeScript em todo o projeto (monorepo com pnpm workspaces)
- Cliente: Vite, React e PixiJS
- Servidor: Node.js, Colyseus e Express
- Banco e autenticação: PostgreSQL e Auth no Supabase, via Prisma

## Documentação

- Escopo da versão 1.0 (fonte da verdade): [docs/rainbow-pixel-escopo-1.0.md](docs/rainbow-pixel-escopo-1.0.md)
- Marcos: [docs/marcos](docs/marcos)
- Instruções para agentes de IA: [AGENTS.md](AGENTS.md)

## Estrutura

| Pasta                   | Conteúdo                                                                         |
| ----------------------- | -------------------------------------------------------------------------------- |
| `apps/client`           | Cliente web (Vite, React nos menus, PixiJS no jogo)                              |
| `apps/server`           | Servidor autoritativo (Colyseus e Express na mesma porta), Prisma                |
| `packages/shared`       | Catálogos, configuração, protocolo, validações e simulação (movimento e colisão) |
| `packages/bots`         | Cérebro dos bots (nível 0: patrulha de waypoints)                                |
| `packages/maps`         | Formato de mapa, grade de colisão e mapas gerados a partir do Tiled              |
| `tools/map-import`      | Importador do Tiled (`pnpm maps:import` e `pnpm maps:check`)                     |
| `tools/headless-client` | Cliente sem tela para testes (`pnpm headless`)                                   |

## Rodando localmente

### 1. Requisitos

- [pnpm](https://pnpm.io/pt/installation) 10. A versão exata está no campo `packageManager` do `package.json`, e o pnpm troca para ela sozinho.
- Node.js 24 LTS (o `.nvmrc` aponta para ele). Os scripts sempre rodam no Node 24: o pnpm baixa a versão fixada em `useNodeVersion` (`pnpm-workspace.yaml`) e usa essa versão, mesmo que o Node instalado na máquina seja outro.
- Um projeto no [Supabase](https://supabase.com) (banco PostgreSQL e autenticação).

### 2. Supabase

1. Crie um projeto (região São Paulo).
2. Em Authentication, mantenha o provedor de e-mail ativo e desligue a confirmação de e-mail.
3. Anote a URL do projeto, a chave publishable e as duas strings de conexão do banco: a do pooler e a direta.
4. Veja se o projeto assina os tokens com chaves assimétricas (padrão dos projetos novos) ou com o segredo legado. Isso define `AUTH_JWT_MODE`.

### 3. Instalação e variáveis de ambiente

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
```

No PowerShell, use `Copy-Item` no lugar de `cp`. Os arquivos `.env` nunca são commitados.

`apps/server/.env`:

| Variável              | Valor                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| `PORT`                | Porta única da API e do WebSocket. Padrão `2567`.                                  |
| `CORS_ORIGINS`        | Origens liberadas, separadas por vírgula. Padrão `http://localhost:5173`.          |
| `DATABASE_URL`        | String de conexão do pooler (Transaction pooler, porta 6543). Usada pelo servidor. |
| `DIRECT_URL`          | Conexão direta (ou Session pooler, porta 5432). Usada só pelas migrations.         |
| `SUPABASE_URL`        | URL do projeto, por exemplo `https://abcdefgh.supabase.co`.                        |
| `AUTH_JWT_MODE`       | `jwks` para chaves assimétricas, `secret` para o segredo legado (HS256).           |
| `SUPABASE_JWT_SECRET` | Só no modo `secret`: o segredo JWT do projeto.                                     |
| `NODE_ENV`            | `development` na sua máquina.                                                      |
| `DEV_TOOLS`           | `true` liga as ferramentas de teste. O servidor não sobe com `true` em produção.   |
| `DEV_NET_LATENCY_MS`  | Simulador de lag: atraso inicial de cada cliente, em ms (só com `DEV_TOOLS=true`). |
| `DEV_NET_JITTER_MS`   | Simulador de lag: variação inicial do atraso, em ms.                               |
| `DEV_NET_LOSS_PCT`    | Simulador de lag: perda inicial de pacotes, em %.                                  |
| `SUPABASE_SECRET_KEY` | Chave secreta do Supabase (secret ou service_role). Só para `pnpm dev:seed-users`. |
| `DEV_SEED_PASSWORD`   | Senha das contas de teste criadas por `pnpm dev:seed-users`.                       |

`apps/client/.env` (tudo aqui vai para o navegador, então só entram valores públicos):

| Variável                        | Valor                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | A mesma URL do projeto.                                                       |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publishable (ou anon) do Supabase.                                      |
| `VITE_SERVER_HTTP_URL`          | Endereço da API. Padrão `http://localhost:2567`.                              |
| `VITE_SERVER_WS_URL`            | Endereço do WebSocket. Padrão `ws://localhost:2567`.                          |
| `VITE_DEV_TOOLS`                | `true` liga a sessão por aba e os botões de acesso rápido no login.           |
| `VITE_DEV_SEED_PASSWORD`        | Opcional, só com `VITE_DEV_TOOLS=true`: a mesma senha de `DEV_SEED_PASSWORD`. |

A chave secreta do Supabase fica somente em `apps/server/.env`. Ela nunca entra no `.env` do cliente.

### 4. Banco

```bash
pnpm db:deploy
```

Aplica as migrations versionadas em `apps/server/prisma/migrations` no banco de `DIRECT_URL`.

### 5. Subir

```bash
pnpm dev
```

- Cliente: http://localhost:5173
- Servidor (API REST e WebSocket): http://localhost:2567

Crie uma conta, escolha um nickname e use "Criar sala" ou "Entrar com código".

### 6. Partida

Com a sala fechada em 2v2 e todos prontos, o servidor conta 3 segundos e a partida começa na mesma sala, no mapa `gym_01`. O host encerra pelo botão "Encerrar partida" e todos voltam ao lobby, não prontos (bots continuam prontos). Se todos os humanos ficarem desconectados, a sala também volta ao lobby.

Controles: WASD move, Shift anda lento, Ctrl corre e o mouse mira. Durante a partida, fechar ou recarregar a aba pede confirmação, porque Ctrl+W fecha a aba e o navegador não deixa o jogo impedir.

## Scripts

Todos rodam na raiz do repositório.

| Script                | O que faz                                                    |
| --------------------- | ------------------------------------------------------------ |
| `pnpm dev`            | Servidor e cliente em paralelo, com recarga automática       |
| `pnpm build`          | Build de `packages/shared`, do servidor e do cliente         |
| `pnpm lint`           | ESLint e checagem de formatação do Prettier                  |
| `pnpm format`         | Formata o repositório com o Prettier                         |
| `pnpm typecheck`      | TypeScript em todos os pacotes                               |
| `pnpm test`           | Testes unitários (Vitest) em todos os pacotes                |
| `pnpm db:migrate`     | `prisma migrate dev`: cria e aplica uma migration nova       |
| `pnpm db:deploy`      | `prisma migrate deploy`: aplica as migrations já versionadas |
| `pnpm db:studio`      | Abre o Prisma Studio                                         |
| `pnpm dev:seed-users` | Cria as 4 contas de teste (exige `DEV_TOOLS=true`)           |
| `pnpm maps:import`    | Valida os mapas do Tiled e grava `packages/maps/generated`   |
| `pnpm maps:check`     | Valida os mapas sem gravar; falha se o gerado estiver velho  |
| `pnpm headless`       | Cliente sem tela para testes (exige `DEV_TOOLS=true`)        |

## Ferramentas de teste

Servem para testar o 2v2 sozinho. Ficam atrás de `DEV_TOOLS=true` no servidor e `VITE_DEV_TOOLS=true` no cliente. O servidor se recusa a iniciar com `DEV_TOOLS=true` e `NODE_ENV=production`, e o build de produção do cliente ignora `VITE_DEV_TOOLS`.

### Contas de teste

1. Em `apps/server/.env`, defina `DEV_TOOLS=true`, `SUPABASE_SECRET_KEY` e `DEV_SEED_PASSWORD` (6 caracteres ou mais).
2. Rode:

   ```bash
   pnpm dev:seed-users
   ```

O script cria (ou mantém, se já existirem) as contas `dev1@rainbowpixel.local` a `dev4@rainbowpixel.local`, já confirmadas, com a senha de `DEV_SEED_PASSWORD`, e os perfis `dev1` a `dev4`. Pode ser rodado quantas vezes for preciso.

### Quatro contas no mesmo navegador

1. Em `apps/client/.env`, defina `VITE_DEV_TOOLS=true` e, se quiser, `VITE_DEV_SEED_PASSWORD` com a mesma senha. Reinicie o `pnpm dev`.
2. Abra 4 abas em http://localhost:5173. Em cada uma, clique em "Entrar como dev1" até "Entrar como dev4". Sem `VITE_DEV_SEED_PASSWORD`, digite a senha no campo de senha antes de clicar.
3. Numa aba, crie a sala. Nas outras, entre com o código.

Com `VITE_DEV_TOOLS=true`, a sessão fica no `sessionStorage`, então cada aba tem a própria conta. Abra abas novas em vez de duplicar uma aba: o navegador copia o `sessionStorage` para a aba duplicada, e ela entraria com a mesma conta.

### Bots no lobby

O host vê "Adicionar bot", com seletor de dificuldade, em cada vaga livre, e "Remover" em cada bot. Um humano que entra numa sala completa com bots substitui o bot adicionado por último. Na partida, o bot nível 0 patrulha os waypoints do mapa em circuito, parando 1 s em cada um (a dificuldade ainda não muda nada).

### Início forçado

Com `DEV_TOOLS=true` no servidor e `VITE_DEV_TOOLS=true` no cliente, o host vê "Iniciar agora (teste)" no lobby: a partida começa com quem estiver na sala, prontos ou não, de 1 a 4 jogadores.

### Simulador de lag e overlay de debug

O servidor aplica atraso, variação e perda às mensagens de input recebidas e às de snapshot e pong enviadas, por cliente. Os valores iniciais vêm de `DEV_NET_LATENCY_MS`, `DEV_NET_JITTER_MS` e `DEV_NET_LOSS_PCT`.

Na partida, F3 abre o overlay de debug (só com `VITE_DEV_TOOLS=true`): FPS, RTT, tick do servidor, buffer de interpolação, inputs pendentes, correções por segundo e tamanho da última correção. O círculo verde é a posição confirmada pelo servidor, desenhada sobre a prevista. O overlay também troca o atraso, a variação e a perda deste cliente.

### Cliente headless

`pnpm headless` entra na sala com uma conta de teste, roda um roteiro de inputs (`idle`, `circle`, `square`, `random-walk`) com a mesma previsão do cliente web e imprime um resumo em JSON. Configure `tools/headless-client/.env` (modelo em `.env.example`) e veja as opções em [tools/headless-client/README.md](tools/headless-client/README.md). Exemplos:

```bash
pnpm headless --script circle --duration 60
pnpm headless --create --bots 3 --script square --duration 60 --latency 150 --jitter 20 --loss 2 --max-corrections-per-min 6
pnpm headless --user dev2 --code ABC123 --script random-walk
```

### Mapas

Os mapas são feitos no [Tiled](https://www.mapeditor.org/) em `packages/maps/tiled` e convertidos por `pnpm maps:import`. A convenção de camadas está em [packages/maps/README.md](packages/maps/README.md). O mapa de teste `gym_01` é gerado por script (`pnpm --filter @rainbow-pixel/maps generate:gym`).

## Homologação com amigos (Cloudflare Tunnel)

O [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) expõe o servidor da sua máquina pela internet, sem abrir porta no roteador.

1. Instale o `cloudflared`.
2. Com o `pnpm dev` rodando, exponha o servidor:

   ```bash
   cloudflared tunnel --url http://localhost:2567
   ```

   O comando mostra um endereço como `https://exemplo-do-servidor.trycloudflare.com`. Ele muda a cada execução.

3. Em `apps/client/.env`, aponte o cliente para o túnel. O WebSocket usa `wss`:

   ```text
   VITE_SERVER_HTTP_URL=https://exemplo-do-servidor.trycloudflare.com
   VITE_SERVER_WS_URL=wss://exemplo-do-servidor.trycloudflare.com
   ```

4. Escolha como o amigo abre o cliente:
   - Ele roda o cliente na máquina dele: clona o repositório, preenche `apps/client/.env` com os valores do passo 3 e as duas variáveis `VITE_SUPABASE_*`, e roda `pnpm --filter @rainbow-pixel/client dev`. A origem dele é `http://localhost:5173`, que já está em `CORS_ORIGINS`.
   - Você expõe também o cliente: em outro terminal, rode `cloudflared tunnel --url http://localhost:5173` e mande o endereço gerado para o amigo. Nesse caso, some esse endereço ao `CORS_ORIGINS` do servidor:

     ```text
     CORS_ORIGINS=http://localhost:5173,https://exemplo-do-cliente.trycloudflare.com
     ```

5. Reinicie o `pnpm dev` depois de mudar os `.env`.

`CORS_ORIGINS` lista as origens das páginas que podem chamar o servidor, sem barra no fim. O endereço do túnel do servidor não entra nessa lista, só o endereço de onde o cliente é aberto.

## CI

O workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) roda em todo push e pull request: instalação com lockfile congelado, lint, typecheck, testes, `prisma migrate deploy` contra um PostgreSQL 16 do próprio workflow, `pnpm maps:check` e build. Se a migration falhar, o pipeline falha.

## Roadmap

| Marco | Entrega                                                | Bot                              |
| ----- | ------------------------------------------------------ | -------------------------------- |
| 0.1   | Fundação: monorepo, CI, login, perfil, sala por código | Bots no lobby, sem comportamento |
| 0.2   | Movimento em rede e mapa importado do Tiled            | Nível 0: boneco                  |
| 0.3   | Tiro hitscan e compensação de lag                      | Nível 1: atirador                |
| 0.4   | Destruição de parede, breach, reforço e barricada      | Nível 2: navegação               |
| 0.5   | Visão, fog of war e som                                | Nível 2: investiga som           |
| 0.6   | Modo Bomba completo                                    | Nível 3: objetivo                |
| 0.7   | Drones, câmeras e espectador                           | Atira em drone e câmera          |
| 0.8   | Arsenal e loadout                                      | Sorteia loadout                  |
| 0.9   | Conta, stats, histórico e XP                           | Partida com bot não conta        |
| 1.0   | Polimento e produção                                   | Balanceamento das dificuldades   |
