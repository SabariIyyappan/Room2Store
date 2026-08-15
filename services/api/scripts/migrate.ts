import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const sql = postgres(databaseUrl, { max: 1 });
const schema = await readFile(new URL("../src/schema.sql", import.meta.url), "utf8");

try {
  await sql.unsafe(schema);
  console.log("Database schema applied.");
} finally {
  await sql.end();
}
