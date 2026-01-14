/**
 * Example: Stream responses in real-time
 * 
 * This example shows how to stream the agent's response as it arrives,
 * providing a real-time typing effect.
 * 
 * Run with: npm run example:stream
 */

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
  console.log("📡 Streaming Example\n");
  
  const prompt = process.argv[2] || "What TypeScript best practices should I follow?";
  console.log(`Prompt: "${prompt}"\n`);
  console.log("─".repeat(50));

  const { stream } = agent.submit({ message: prompt });

  for await (const delta of stream) {
    switch (delta.type) {
      case "text-delta":
        process.stdout.write(delta.text);
        break;
      case "tool-call-started":
        console.log(`\n🔧 Tool started: ${delta.name}`);
        break;
      case "tool-call-completed":
        console.log(`✅ Tool completed: ${delta.name}\n`);
        break;
      case "thinking-delta":
        // Optionally show thinking process
        // process.stdout.write(`[thinking] ${delta.text}`);
        break;
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log("Stream completed.");
}

main().catch(console.error);
