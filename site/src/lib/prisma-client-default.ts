import prismaDefault from "../../node_modules/.prisma/client/default.js";

const {
  PrismaClient,
  Prisma,
  $Enums,
  Decimal,
} = prismaDefault as unknown as {
  PrismaClient: new (...args: any[]) => any;
  Prisma: Record<string, unknown>;
  $Enums: Record<string, unknown>;
  Decimal?: unknown;
};

export { PrismaClient, Prisma, $Enums, Decimal };
export default prismaDefault;
