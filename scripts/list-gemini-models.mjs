/**
 * Lists the Gemini models this key can actually call, so model ids are never
 * guessed. Google retires ids without warning.
 *
 * Usage: npm run gemini:models
 */

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY is not set in .env.");
  process.exit(1);
}

const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
  headers: { "x-goog-api-key": key },
  signal: AbortSignal.timeout(30_000)
});

if (!response.ok) {
  console.error(`Model list failed with status ${response.status}: ${(await response.text()).slice(0, 300)}`);
  process.exit(1);
}

const { models = [] } = await response.json();
const usable = models
  .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
  .map((model) => model.name.replace(/^models\//, ""))
  .sort();

console.log(`${usable.length} models support generateContent:\n`);
for (const name of usable) console.log(`  ${name}`);

const suggestion = usable.find((name) => /flash-lite/.test(name)) ?? usable.find((name) => /flash/.test(name));
if (suggestion) {
  console.log(`\nCheapest-looking choice: ${suggestion}`);
  console.log(`Set it in Render as GEMINI_PRIMARY_MODEL=${suggestion}`);
}
