import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

const PRISMA_CACHE = Symbol.for("domain-alert.prisma");

type PrismaCache = WeakMap<any, PrismaClient>;

export const getPrismaClient = (binding: unknown): PrismaClient | null => {
  if (!binding) return null;

  const globalWithCache = globalThis as typeof globalThis & { [PRISMA_CACHE]?: PrismaCache };
  globalWithCache[PRISMA_CACHE] ??= new WeakMap();

  const cache = globalWithCache[PRISMA_CACHE]!;
  let client = cache.get(binding);

  if (!client) {
    const adapter = new PrismaD1(binding as any);
    client = new PrismaClient({ adapter });
    cache.set(binding, client);
  }

  return client;
};
