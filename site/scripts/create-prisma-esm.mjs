import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const targetDir = path.resolve(process.cwd(), "node_modules", ".prisma", "client");
const targetFile = path.join(targetDir, "default-esm.js");

const fileContents = `import * as main from '#main-entry-point';

const PrismaClient = main.PrismaClient;
const Prisma = main.Prisma;
const $Enums = main.$Enums;
const Decimal = main.Decimal;

export { PrismaClient, Prisma, $Enums, Decimal };
export default main;\n`;

await mkdir(targetDir, { recursive: true });
await writeFile(targetFile, fileContents, "utf8");
