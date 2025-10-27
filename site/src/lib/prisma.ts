import { PrismaD1 } from "@prisma/adapter-d1";

type PrismaClientType = import("@prisma/client").PrismaClient;

const REMOTE_CACHE = Symbol.for("domain-alert.prisma.remote");
const LOCAL_CACHE = Symbol.for("domain-alert.prisma.local");

type PrismaCache = WeakMap<object, PrismaClientType>;

let prismaModulePromise: Promise<typeof import("@prisma/client")> | null = null;

const loadPrismaClient = async () => {
  if (!prismaModulePromise) {
    prismaModulePromise = import("@prisma/client");
  }
  return prismaModulePromise;
};

export const getPrismaClient = async (binding: unknown): Promise<PrismaClientType | null> => {
  const { PrismaClient } = await loadPrismaClient();

  // Local development (no D1 binding provided)
  if (!binding) {
    const globalWithLocalCache = globalThis as typeof globalThis & {
      [LOCAL_CACHE]?: PrismaClientType;
    };

    if (!globalWithLocalCache[LOCAL_CACHE]) {
      globalWithLocalCache[LOCAL_CACHE] = new PrismaClient();
    }

    return globalWithLocalCache[LOCAL_CACHE]!;
  }

  const globalWithRemoteCache = globalThis as typeof globalThis & {
    [REMOTE_CACHE]?: PrismaCache;
  };
  globalWithRemoteCache[REMOTE_CACHE] ??= new WeakMap();

  const cache = globalWithRemoteCache[REMOTE_CACHE]!;
  const key = binding as object;
  const cached = cache.get(key);

  if (cached) {
    return cached;
  }

  const adapter = new PrismaD1(binding as any);
  const client = new PrismaClient({ adapter });
  cache.set(key, client);
  return client;
};
