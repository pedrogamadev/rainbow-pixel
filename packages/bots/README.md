# packages/bots

Pasta reservada para o cérebro dos bots (seção 16 do escopo da 1.0).

A implementação começa no marco 0.2. As regras que valem desde já:

- TypeScript puro: sem DOM, sem PixiJS, sem Colyseus, sem Node APIs.
- O bot recebe somente a `PlayerView` filtrada que um cliente humano receberia e devolve um `InputCommand`, que passa pelas mesmas validações do servidor.
- O bot nunca lê o estado completo da partida e nunca grava no banco.
- Todo comportamento é testado por cenários: situação montada, comando esperado.

No marco 0.1 os bots existem apenas como vagas do lobby (`apps/server/src/rooms/lobbySlots.ts`), sem comportamento. As dificuldades ficam em `packages/shared/src/catalog/botDifficulties.ts` e os parâmetros de cada uma em `packages/shared/src/config`.
