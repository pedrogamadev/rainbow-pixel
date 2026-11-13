import { nicknameKey } from '@rainbow-pixel/shared';
import type { ProfileDto } from '@rainbow-pixel/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface ProfileRecord {
  readonly id: string;
  readonly nickname: string;
  readonly level: number;
  readonly xp: number;
  readonly createdAt: Date;
}

export type CreateProfileResult =
  | { readonly ok: true; readonly profile: ProfileRecord }
  | { readonly ok: false; readonly error: 'nickname_taken' | 'profile_exists' };

/** Acesso a perfis. A API e a sala dependem só desta interface. */
export interface ProfileStore {
  findById(id: string): Promise<ProfileRecord | null>;
  /** Cria o perfil e as estatísticas zeradas. O nickname já chega validado. */
  create(id: string, nickname: string): Promise<CreateProfileResult>;
}

export function toProfileDto(profile: ProfileRecord): ProfileDto {
  return {
    id: profile.id,
    nickname: profile.nickname,
    level: profile.level,
    xp: profile.xp,
    createdAt: profile.createdAt.toISOString(),
  };
}

const profileSelect = {
  id: true,
  nickname: true,
  level: true,
  xp: true,
  createdAt: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function createPrismaProfileStore(prisma: PrismaClient): ProfileStore {
  const findById = (id: string) =>
    prisma.profile.findUnique({ where: { id }, select: profileSelect });

  return {
    findById,

    async create(id, nickname) {
      const nicknameLower = nicknameKey(nickname);

      if ((await findById(id)) !== null) {
        return { ok: false, error: 'profile_exists' };
      }
      const sameNickname = await prisma.profile.findUnique({
        where: { nicknameLower },
        select: { id: true },
      });
      if (sameNickname !== null) {
        return { ok: false, error: 'nickname_taken' };
      }

      try {
        const profile = await prisma.profile.create({
          data: { id, nickname, nicknameLower, stats: { create: {} } },
          select: profileSelect,
        });
        return { ok: true, profile };
      } catch (error) {
        // Duas criações ao mesmo tempo: quem decide é o índice único do banco.
        if (!isUniqueViolation(error)) {
          throw error;
        }
        const existing = await findById(id);
        return { ok: false, error: existing !== null ? 'profile_exists' : 'nickname_taken' };
      }
    },
  };
}
