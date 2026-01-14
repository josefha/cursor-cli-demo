/**
 * Screenshot Testing with Cursor Agent
 * 
 * Opens a URL in a browser, takes a screenshot, and asks the Cursor agent
 * to evaluate it based on your task/assignment.
 * 
 * Usage:
 *   npx tsx src/examples/screenshot-test.ts <url> "<task>"
 *   npx tsx src/examples/screenshot-test.ts --login <url>
 * 
 * Examples:
 *   npx tsx src/examples/screenshot-test.ts https://example.com "Is the page loading correctly?"
 *   npx tsx src/examples/screenshot-test.ts http://localhost:3000 "Check if the login form is visible"
 *   npx tsx src/examples/screenshot-test.ts --login https://github.com  # Login once, session persists
 */

import "dotenv/config";
import puppeteer from "puppeteer";
import * as readline from "readline";
import { mkdirSync } from "fs";
import { join } from "path";
import { CursorAgent } from "@cursor-ai/january";

// Persistent browser profile directory
const USER_DATA_DIR = join(process.cwd(), ".browser-profile");

interface ScreenshotTestOptions {
  url: string;
  task: string;
  width?: number;
  height?: number;
  headless?: boolean;
  waitTime?: number;
}

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function loginMode(url: string): Promise<void> {
  console.log("🔐 Login Mode\n");
  console.log(`Opening browser with persistent profile at: ${USER_DATA_DIR}\n`);

  mkdirSync(USER_DATA_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    userDataDir: USER_DATA_DIR,
    args: [
      "--new-window",
      "--window-size=1280,800",
      "--window-position=100,100",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log(`🌐 Navigating to: ${url}`);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  console.log("\n" + "─".repeat(50));
  console.log("📝 Please log in manually in the browser window.");
  console.log("   Your session will be saved for future runs.");
  console.log("─".repeat(50));

  await waitForEnter("\nPress ENTER when you're done logging in... ");

  console.log("\n✅ Session saved! You can now use screenshot tests with this login.");
  console.log("   The browser profile is stored at: " + USER_DATA_DIR);

  await browser.close();
}

async function takeScreenshot(options: ScreenshotTestOptions): Promise<string> {
  const {
    url,
    width = 1280,
    height = 800,
    headless = false,
    waitTime = 2000,
  } = options;

  console.log(`🌐 Opening browser at: ${url}`);
  console.log(`📁 Using profile: ${USER_DATA_DIR}`);

  // Ensure profile directory exists
  mkdirSync(USER_DATA_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: null,
    userDataDir: USER_DATA_DIR,
    args: [
      "--new-window",
      `--window-size=${width},${height}`,
      "--window-position=100,100",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height });

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  } catch (error) {
    console.log("⚠️  Page load timeout, continuing with current state...");
  }

  // Wait a bit for any animations/rendering
  await new Promise((resolve) => setTimeout(resolve, waitTime));

  // Ensure screenshots directory exists
  const screenshotsDir = join(process.cwd(), "screenshots");
  mkdirSync(screenshotsDir, { recursive: true });

  const timestamp = Date.now();
  const screenshotPath = join(screenshotsDir, `screenshot-${timestamp}.png`);

  console.log(`📸 Taking screenshot...`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  console.log(`✅ Screenshot saved: ${screenshotPath}`);

  await browser.close();

  return screenshotPath;
}

async function evaluateWithAgent(
  screenshotPath: string,
  task: string,
  url: string
): Promise<void> {
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

  console.log(`\n🤖 Sending screenshot to Cursor Agent for evaluation...`);
  console.log(`📋 Task: "${task}"`);
  console.log("─".repeat(50));

  // Use the agent's built-in read tool to view the image
  const prompt = `I've taken a screenshot of a webpage at ${url} and saved it to: ${screenshotPath}

Please read/view this screenshot image file and analyze it.

Task to evaluate: ${task}

After viewing the screenshot, provide feedback based on the task.
Look for any issues, suggestions for improvement, or confirm if everything looks correct.`;

  const { stream } = agent.submit({
    message: prompt,
  });

  for await (const delta of stream) {
    if (delta.type === "text-delta") {
      process.stdout.write(delta.text);
    } else if (delta.type === "tool-call-started") {
      console.log(`\n🔧 ${delta.name}`);
    } else if (delta.type === "tool-call-completed") {
      console.log(`✅ Done\n`);
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log("✅ Evaluation complete.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for login mode
  if (args[0] === "--login") {
    const url = args[1];
    if (!url) {
      console.log("Usage: npx tsx src/examples/screenshot-test.ts --login <url>");
      process.exit(1);
    }
    await loginMode(url);
    return;
  }

  if (args.length < 2) {
    console.log(`
📸 Screenshot Test Tool

Usage:
  npx tsx src/examples/screenshot-test.ts <url> "<task>"
  npx tsx src/examples/screenshot-test.ts --login <url>

Commands:
  --login <url>   Open browser to log in manually (session persists)

Arguments:
  url   - The webpage URL to screenshot
  task  - The evaluation task/question for the AI

Examples:
  # First, log in to save your session:
  npx tsx src/examples/screenshot-test.ts --login https://github.com

  # Then take screenshots (logged in):
  npx tsx src/examples/screenshot-test.ts https://github.com "Check my dashboard"
  npx tsx src/examples/screenshot-test.ts https://example.com "Is the page accessible?"

Options (via environment variables):
  HEADLESS=true     - Run browser in headless mode (default: false)
  WAIT_TIME=3000    - Wait time in ms after page load (default: 2000)

Session:
  Browser profile is stored at: .browser-profile/
  Delete this folder to clear saved sessions.
`);
    process.exit(1);
  }

  const [url, task] = args;
  const headless = process.env.HEADLESS === "true";
  const waitTime = parseInt(process.env.WAIT_TIME || "2000", 10);

  console.log("🚀 Screenshot Test Tool\n");

  const screenshotPath = await takeScreenshot({
    url,
    task,
    headless,
    waitTime,
  });

  await evaluateWithAgent(screenshotPath, task, url);
}

main().catch(console.error);
