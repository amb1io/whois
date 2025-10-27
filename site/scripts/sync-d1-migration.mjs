import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const prismaMigrationsDir = path.resolve("prisma", "migrations");
const d1MigrationsDir = path.resolve("migrations");

async function main() {
  const [, , targetArg] = process.argv;

  const prismaDirs = (await readdir(prismaMigrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (prismaDirs.length === 0) {
    throw new Error("No Prisma migrations found in prisma/migrations.");
  }

  const prismaDirName = targetArg
    ? prismaDirs.find((name) => name.includes(targetArg))
    : prismaDirs[prismaDirs.length - 1];

  if (!prismaDirName) {
    throw new Error(
      targetArg
        ? `Could not find a Prisma migration matching "${targetArg}".`
        : "Could not determine the latest Prisma migration."
    );
  }

  const prismaMigrationPath = path.join(prismaMigrationsDir, prismaDirName, "migration.sql");
  const prismaSql = await readFile(prismaMigrationPath, "utf8");

  await mkdir(d1MigrationsDir, { recursive: true });
  const d1Files = await readdir(d1MigrationsDir, { withFileTypes: true });
  const existingNumbers = d1Files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name.match(/^(\d{4})/))
    .filter(Boolean)
    .map((match) => Number(match[1]));

  const nextNumber = String((existingNumbers.length ? Math.max(...existingNumbers) : 0) + 1).padStart(4, "0");
  const sanitizedName = prismaDirName.replace(/^\d+_/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const d1FileName = `${nextNumber}_${sanitizedName}.sql`;
  const d1FilePath = path.join(d1MigrationsDir, d1FileName);

  await writeFile(d1FilePath, prismaSql, "utf8");

  console.log(`Created D1 migration: ${path.relative(process.cwd(), d1FilePath)}`);
  console.log(`Source: prisma/migrations/${prismaDirName}/migration.sql`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
