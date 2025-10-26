import type { PrismaClient as PrismaClientType } from "@prisma/client/edge";
import { PrismaD1 } from "@prisma/adapter-d1";

const PRISMA_CACHE = Symbol.for("domain-alert.prisma");

type PrismaCache = WeakMap<object, PrismaClientType>;

let prismaModulePromise: Promise<typeof import("@prisma/client/edge")> | null = null;

const loadPrismaClient = async () => {
  if (!prismaModulePromise) {
    const globalAny = globalThis as typeof globalThis & {
      navigator?: { userAgent?: string };
    };

    globalAny.navigator ??= {};
    globalAny.navigator.userAgent ??= "Cloudflare-Workers";

    prismaModulePromise = import("@prisma/client/edge");
  }

  return prismaModulePromise;
};

export const getPrismaClient = async (binding: unknown): Promise<PrismaClientType | null> => {
  if (!binding) return null;

  const globalWithCache = globalThis as typeof globalThis & {
    [PRISMA_CACHE]?: PrismaCache;
  };
  globalWithCache[PRISMA_CACHE] ??= new WeakMap();

  const cache = globalWithCache[PRISMA_CACHE]!;
  const key = binding as object;
  const cached = cache.get(key);

  if (cached) {
    return cached;
  }

  const { PrismaClient } = await loadPrismaClient();
  const adapter = new PrismaD1(binding as any);
  const client = new PrismaClient({ adapter });

  cache.set(key, client);
  return client;
};
