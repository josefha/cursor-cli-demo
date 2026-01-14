/**
 * Example: Interactive conversation with the agent
 * 
 * This example shows how to have a multi-turn conversation
 * with the Cursor agent using readline for input.
 * 
 * Run with: npx tsx src/examples/interactive.ts
 */

import "dotenv/config";
import * as readline from "readline";
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function chat(message: string): Promise<void> {
  const { stream } = agent.submit({ message });

  for await (const delta of stream) {
    if (delta.type === "text-delta") {
      process.stdout.write(delta.text);
    } else if (delta.type === "tool-call-started") {
      console.log(`\n🔧 Using tool: ${delta.name}`);
    } else if (delta.type === "tool-call-completed") {
      console.log(`✅ Tool done: ${delta.name}\n`);
    }
  }
  console.log("\n");
}

async function main(): Promise<void> {
  console.log("💬 Interactive Cursor Agent");
  console.log("Type 'exit' or 'quit' to end the session.\n");
  console.log("─".repeat(50));

  while (true) {
    const input = await prompt("\n🧑 You: ");
    
    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log("\nGoodbye! 👋");
      break;
    }

    if (!input.trim()) {
      continue;
    }

    console.log("\n🤖 Agent:");
    await chat(input);
  }

  const turns = agent.conversation();
  console.log(`\nSession ended. Total turns: ${turns.length}`);
  rl.close();
}

main().catch(console.error);
