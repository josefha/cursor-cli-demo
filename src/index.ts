import "dotenv/config";
import { CursorAgent } from "@cursor-ai/january";

const apiKey = process.env.CURSOR_API_KEY;

if (!apiKey) {
  console.error("Error: CURSOR_API_KEY is not set in .env file");
  process.exit(1);
}

const agent = new CursorAgent({
  apiKey,
  model: "claude-4.5-sonnet",
  workingLocation: { type: "local", localDirectory: process.cwd() },
});

async function main(): Promise<void> {
  console.log("🚀 Cursor Agent Demo\n");
  console.log("Asking agent to analyze this codebase...\n");
  console.log("─".repeat(50));

  const { stream } = agent.submit({
    message: "What are the main files in this project? Give a brief overview.",
  });

  for await (const delta of stream) {
    if (delta.type === "text-delta") {
      process.stdout.write(delta.text);
    }
  }

  const turns = agent.conversation();
  console.log("\n" + "─".repeat(50));
  console.log(`\n✅ Completed. Total turns: ${turns.length}`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
