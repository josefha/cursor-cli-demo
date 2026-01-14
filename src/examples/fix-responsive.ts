/**
 * Fix Responsive Issues with Cursor SDK
 * 
 * Takes a viewport test report and uses the Cursor SDK to implement fixes
 * in a target repository.
 * 
 * Usage:
 *   npx tsx src/examples/fix-responsive.ts <report-dir> <target-repo>
 * 
 * Example:
 *   npx tsx src/examples/fix-responsive.ts output/report-2026-01-14T18-49-04 /Users/josef/Desktop/projects/solace/solace-web
 */

import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { CursorAgent } from "@cursor-ai/january";

async function fixResponsiveIssues(
  reportDir: string,
  targetRepo: string
): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;

  if (!apiKey) {
    console.error("Error: CURSOR_API_KEY is not set in .env file");
    process.exit(1);
  }

  // Read the report
  const reportPath = join(reportDir, "report.md");
  if (!existsSync(reportPath)) {
    console.error(`Error: Report not found at ${reportPath}`);
    process.exit(1);
  }

  const report = readFileSync(reportPath, "utf-8");

  // Extract the suggested modifications section
  const suggestedModsMatch = report.match(
    /## Suggested Modifications[\s\S]*?```markdown([\s\S]*?)```/
  );
  const suggestedMods = suggestedModsMatch
    ? suggestedModsMatch[1].trim()
    : report;

  // Extract priority fixes from JSON if available
  const jsonMatch = report.match(/```json([\s\S]*?)```/);
  let priorityFixes: string[] = [];
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      priorityFixes = parsed.priority_fixes || [];
    } catch {
      // Ignore JSON parse errors
    }
  }

  console.log("🔧 Fix Responsive Issues with Cursor SDK\n");
  console.log(`📁 Target repo: ${targetRepo}`);
  console.log(`📄 Report: ${reportPath}\n`);
  console.log("─".repeat(60));

  const agent = new CursorAgent({
    apiKey,
    model: "claude-4.5-sonnet",
    workingLocation: { type: "local", localDirectory: targetRepo },
  });

  const prompt = `I have a responsive design evaluation report with issues that need to be fixed in this codebase.

## Priority Fixes
${priorityFixes.map((fix, i) => `${i + 1}. ${fix}`).join("\n")}

## Full Report
${suggestedMods}

## Instructions
1. First, explore the codebase to understand the structure (look for CSS/SCSS files, component files, layout files)
2. Identify the relevant files that need to be modified
3. Implement the responsive design fixes mentioned above
4. Focus on:
   - CSS Grid layouts for card containers
   - Proper max-width constraints for content areas
   - Media queries for different breakpoints (768px, 1440px, 2000px+)
   - Touch target accessibility (min 44x44px)
   - Consistent spacing and gap values

Please implement these fixes now. Make sure to:
- Use existing CSS variables if available
- Follow the existing code style and patterns
- Add comments explaining the responsive breakpoints
- Test that changes don't break mobile layouts`;

  console.log("🤖 Cursor Agent is analyzing and fixing the codebase...\n");

  const { stream } = agent.submit({ message: prompt });

  for await (const delta of stream) {
    if (delta.type === "text-delta") {
      process.stdout.write(delta.text);
    } else if (delta.type === "tool-call-started") {
      const toolType = delta.toolCall?.type || "unknown";
      console.log(`\n🔧 [${toolType}]`);
    } else if (delta.type === "tool-call-completed") {
      console.log(`✅ Done`);
    }
  }

  console.log("\n\n" + "─".repeat(60));
  console.log("✅ Fixes applied!");
  console.log(`\nNext steps:`);
  console.log(`  1. cd ${targetRepo}`);
  console.log(`  2. git diff  # Review changes`);
  console.log(`  3. npm run viewport-test -- <url>  # Re-test`);
  console.log(`  4. git add . && git commit -m "fix: responsive design improvements"`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
🔧 Fix Responsive Issues with Cursor SDK

Reads a viewport test report and implements fixes in a target repository.

Usage:
  npx tsx src/examples/fix-responsive.ts <report-dir> <target-repo>

Arguments:
  report-dir   - Path to the viewport test report directory
  target-repo  - Path to the repository where fixes should be applied

Example:
  npx tsx src/examples/fix-responsive.ts \\
    output/report-2026-01-14T18-49-04 \\
    /Users/josef/Desktop/projects/solace/solace-web
`);
    process.exit(1);
  }

  const [reportDir, targetRepo] = args;

  if (!existsSync(targetRepo)) {
    console.error(`Error: Target repository not found: ${targetRepo}`);
    process.exit(1);
  }

  await fixResponsiveIssues(reportDir, targetRepo);
}

main().catch(console.error);
