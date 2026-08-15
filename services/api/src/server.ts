import postgres from "postgres";
import { createApp } from "./app.ts";
import { InMemoryRepository, PostgresRepository } from "./repository.ts";

const useInMemory = process.env.USE_IN_MEMORY_DB === "true" || !process.env.DATABASE_URL;
const repository = useInMemory
  ? new InMemoryRepository()
  : new PostgresRepository(postgres(process.env.DATABASE_URL!, { max: 10 }));

const app = createApp(repository);
const port = Number(process.env.PORT ?? 3000);

await app.listen({ port, host: "0.0.0.0" });
