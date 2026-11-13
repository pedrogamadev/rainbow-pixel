-- CreateEnum
CREATE TYPE "Side" AS ENUM ('ATTACK', 'DEFENSE');

-- CreateEnum
CREATE TYPE "RoundEndReason" AS ENUM ('ELIMINATION', 'BOMB_DETONATED', 'BOMB_DEFUSED', 'TIME_EXPIRED');

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "nickname" VARCHAR(16) NOT NULL,
    "nicknameLower" VARCHAR(16) NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStats" (
    "profileId" UUID NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "roundsPlayed" INTEGER NOT NULL DEFAULT 0,
    "roundsWon" INTEGER NOT NULL DEFAULT 0,
    "shotsFired" INTEGER NOT NULL DEFAULT 0,
    "shotsHit" INTEGER NOT NULL DEFAULT 0,
    "plants" INTEGER NOT NULL DEFAULT 0,
    "defuses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerStats_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "Loadout" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "operatorId" TEXT NOT NULL DEFAULT 'recruit',
    "side" "Side" NOT NULL,
    "primaryId" TEXT NOT NULL,
    "secondaryId" TEXT NOT NULL,

    CONSTRAINT "Loadout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "modeId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "scoreTeamA" INTEGER NOT NULL,
    "scoreTeamB" INTEGER NOT NULL,
    "winnerTeam" INTEGER,
    "botCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "matchId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "team" INTEGER NOT NULL,
    "startSide" "Side" NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "xpGained" INTEGER NOT NULL,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("matchId","profileId")
);

-- CreateTable
CREATE TABLE "MatchRound" (
    "matchId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "attackTeam" INTEGER NOT NULL,
    "winnerTeam" INTEGER NOT NULL,
    "reason" "RoundEndReason" NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "MatchRound_pkey" PRIMARY KEY ("matchId","number")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_nickname_key" ON "Profile"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_nicknameLower_key" ON "Profile"("nicknameLower");

-- CreateIndex
CREATE UNIQUE INDEX "Loadout_profileId_operatorId_side_key" ON "Loadout"("profileId", "operatorId", "side");

-- AddForeignKey
ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loadout" ADD CONSTRAINT "Loadout_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRound" ADD CONSTRAINT "MatchRound_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
