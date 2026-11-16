-- Liga o RLS em todas as tabelas do schema public, que a Data API do Supabase expõe para quem
-- tem a chave publishable. Sem policies, ninguém lê nem grava nada por essa API.
-- O servidor não é afetado: ele conecta como dono das tabelas, e o RLS sem FORCE não vale
-- para o dono. Sem REVOKE para anon e authenticated, porque esses roles não existem no
-- PostgreSQL do CI.

ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlayerStats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Loadout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Match" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchPlayer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatchRound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
