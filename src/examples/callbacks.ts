/**
 * Example: Use callbacks for step-by-step updates
 * 
 * This example demonstrates using onStep and onDelta callbacks
 * for more granular control over the agent's progress.
 * 
 * Run with: npm run example:callbacks
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
  console.log("📋 Callbacks Example\n");
  
  const prompt = process.argv[2] || "List the files in the current directory";
  console.log(`Prompt: "${prompt}"\n`);
  console.log("─".repeat(50));

  const { conversation } = agent.submit({
    message: prompt,
    onStep: ({ step }) => {
      console.log(`\n📌 Step completed:`, JSON.stringify(step, null, 2));
    },
    onDelta: ({ update }) => {
      if (update.type === "text-delta") {
        process.stdout.write(update.text);
      } else if (update.type === "tool-call-started") {
        console.log(`\n🔧 [${update.type}] ${update.name}`);
      } else if (update.type === "tool-call-completed") {
        console.log(`✅ [${update.type}] ${update.name}`);
      }
    },
  });

  // Wait for the conversation to complete
  const turns = await conversation;
  
  console.log("\n" + "─".repeat(50));
  console.log(`\n✅ Conversation completed with ${turns.length} turn(s)`);
}

main().catch(console.error);
