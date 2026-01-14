/**
 * Full Responsive Fix Workflow
 * 
 * Complete workflow that:
 * 1. Takes "before" screenshots with accessibility audit
 * 2. Uses Cursor SDK to implement fixes in target repo
 * 3. Takes "after" screenshots
 * 4. Generates comparison report (before/after)
 * 
 * Usage:
 *   npx tsx src/examples/full-workflow.ts <url> <target-repo>
 * 
 * Example:
 *   npx tsx src/examples/full-workflow.ts http://localhost:5173 /Users/josef/Desktop/projects/solace/solace-web
 */

import "dotenv/config";
import puppeteer, { Viewport } from "puppeteer";
import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mdToPdf } from "md-to-pdf";
import { CursorAgent } from "@cursor-ai/january";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USER_DATA_DIR = join(process.cwd(), ".browser-profile");
const OUTPUT_DIR = join(process.cwd(), "output");

interface DeviceConfig {
  name: string;
  viewport: Viewport;
  userAgent?: string;
}

const USER_AGENTS = {
  iPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

const DEVICES: DeviceConfig[] = [
  {
    name: "iPhone 15 Pro",
    viewport: { width: 393, height: 852, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    userAgent: USER_AGENTS.iPhone,
  },
  {
    name: "Android (Pixel 7)",
    viewport: { width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    userAgent: USER_AGENTS.Android,
  },
  {
    name: "Laptop 13-inch",
    viewport: { width: 1600, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  },
  {
    name: "Ultrawide",
    viewport: { width: 2560, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  },
];

interface ScreenshotResult {
  device: string;
  path: string;
  filename: string;
  viewport: Viewport;
  accessibilityIssues?: { type: string; description: string; suggestion?: string }[];
}

interface DeviceEvaluation {
  device: string;
  resolution: string;
  status: string;
  feedback: string;
  issues: string[];
  suggestions: string[];
  accessibility_status?: string;
}

async function takeScreenshots(
  url: string,
  outputDir: string,
  label: string
): Promise<ScreenshotResult[]> {
  console.log(`\n📸 Taking ${label} screenshots...`);

  mkdirSync(USER_DATA_DIR, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    userDataDir: USER_DATA_DIR,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const results: ScreenshotResult[] = [];

  for (const device of DEVICES) {
    const safeName = device.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const filename = `${safeName}.png`;
    const screenshotPath = join(outputDir, filename);

    console.log(`   📱 ${device.name}...`);

    const page = await browser.newPage();
    await page.setViewport(device.viewport);
    if (device.userAgent) await page.setUserAgent(device.userAgent);

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    } catch {
      // Continue on timeout
    }

    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Accessibility check
    const issues: ScreenshotResult["accessibilityIssues"] = [];
    try {
      const checks = await page.evaluate((isMobile: boolean) => {
        const results = {
          missingAltText: 0,
          smallTouchTargets: 0,
          missingLabels: 0,
          missingLandmarks: false,
        };

        document.querySelectorAll("img").forEach((img) => {
          if (!img.alt && !img.getAttribute("aria-label")) results.missingAltText++;
        });

        if (isMobile) {
          document.querySelectorAll("button, a, input, [role='button']").forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width < 44 || rect.height < 44) results.smallTouchTargets++;
          });
        }

        document.querySelectorAll("input, select, textarea").forEach((input) => {
          const id = input.id;
          const hasLabel = id && document.querySelector(`label[for="${id}"]`);
          if (!hasLabel && !input.getAttribute("aria-label")) results.missingLabels++;
        });

        const hasMain = !!document.querySelector("main, [role='main']");
        const hasNav = !!document.querySelector("nav, [role='navigation']");
        results.missingLandmarks = !hasMain || !hasNav;

        return results;
      }, device.viewport.isMobile || false);

      if (checks.missingAltText > 0) {
        issues.push({ type: "missing-alt", description: `${checks.missingAltText} images missing alt text` });
      }
      if (checks.smallTouchTargets > 0) {
        issues.push({ type: "small-touch-targets", description: `${checks.smallTouchTargets} elements below 44x44px` });
      }
      if (checks.missingLabels > 0) {
        issues.push({ type: "missing-labels", description: `${checks.missingLabels} form inputs missing labels` });
      }
      if (checks.missingLandmarks) {
        issues.push({ type: "missing-landmarks", description: "Missing main/nav landmarks" });
      }
    } catch {
      // Ignore accessibility check errors
    }

    results.push({
      device: device.name,
      path: screenshotPath,
      filename,
      viewport: device.viewport,
      accessibilityIssues: issues,
    });

    await page.close();
  }

  await browser.close();
  console.log(`   ✅ ${results.length} screenshots saved`);
  return results;
}

async function evaluateWithAgent(
  results: ScreenshotResult[],
  url: string
): Promise<{ evaluations: DeviceEvaluation[]; rawResponse: string }> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("Error: CURSOR_API_KEY not set");
    process.exit(1);
  }

  const agent = new CursorAgent({
    apiKey,
    model: "claude-4.5-sonnet",
    workingLocation: { type: "local", localDirectory: process.cwd() },
  });

  console.log(`\n🤖 Evaluating screenshots...`);

  const screenshotList = results
    .map((r) => `- ${r.device} (${r.viewport.width}x${r.viewport.height}): ${r.path}`)
    .join("\n");

  const a11yContext = results
    .filter((r) => r.accessibilityIssues?.length)
    .map((r) => `${r.device}: ${r.accessibilityIssues?.map((i) => i.description).join(", ")}`)
    .join("\n");

  const prompt = `Evaluate these screenshots for responsive design and accessibility.

## Screenshots:
${screenshotList}

## Accessibility Issues Found:
${a11yContext || "None detected"}

Output ONLY valid JSON:
{
  "evaluations": [
    {
      "device": "Device Name",
      "resolution": "WIDTHxHEIGHT",
      "status": "good" | "minor_issues" | "broken",
      "feedback": "Brief feedback",
      "issues": ["Issue 1"],
      "suggestions": ["CSS fix suggestion with specific selectors/properties"],
      "accessibility_status": "good" | "issues" | "critical"
    }
  ],
  "summary": "Overall summary",
  "priority_fixes": ["Fix 1", "Fix 2", "Fix 3"]
}`;

  const { stream } = agent.submit({ message: prompt });

  let rawResponse = "";
  for await (const delta of stream) {
    if (delta.type === "text-delta") {
      rawResponse += delta.text;
    } else if (delta.type === "tool-call-started") {
      process.stdout.write(".");
    }
  }
  console.log(" Done");

  let evaluations: DeviceEvaluation[] = [];
  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      evaluations = parsed.evaluations || [];
    }
  } catch {
    console.log("   ⚠️  Could not parse response");
  }

  return { evaluations, rawResponse };
}

async function applyFixes(
  evaluations: DeviceEvaluation[],
  targetRepo: string,
  url: string
): Promise<void> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error("Error: CURSOR_API_KEY not set");
    process.exit(1);
  }

  console.log(`\n🔧 Applying fixes to ${targetRepo}...`);

  const agent = new CursorAgent({
    apiKey,
    model: "claude-4.5-sonnet",
    workingLocation: { type: "local", localDirectory: targetRepo },
  });

  const allSuggestions = evaluations.flatMap((e) => e.suggestions || []);
  const allIssues = evaluations.flatMap((e) => e.issues || []);
  const priorityFixes = [...new Set(allSuggestions)];

  const prompt = `Fix the responsive design and accessibility issues in this codebase.

## URL Being Tested: ${url}

## Priority Fixes Required:
${priorityFixes.map((f, i) => `${i + 1}. ${f}`).join("\n")}

## All Issues Found:
${allIssues.map((i) => `- ${i}`).join("\n")}

## Instructions:
1. First explore the codebase to find relevant CSS/component files
2. Implement the fixes with proper media queries:
   - Mobile: default styles
   - Tablet: @media (min-width: 768px)
   - Desktop: @media (min-width: 1024px)
   - Large: @media (min-width: 1440px)
   - Ultrawide: @media (min-width: 2000px)
3. Ensure touch targets are at least 44x44px on mobile
4. Add proper accessibility attributes where missing
5. Use CSS Grid for responsive card layouts
6. Add max-width constraints for content areas

Please implement these fixes now.`;

  const { stream } = agent.submit({ message: prompt });

  for await (const delta of stream) {
    if (delta.type === "text-delta") {
      process.stdout.write(delta.text);
    } else if (delta.type === "tool-call-started") {
      const toolType = delta.toolCall?.type || "unknown";
      console.log(`\n   🔧 [${toolType}]`);
    } else if (delta.type === "tool-call-completed") {
      console.log(`   ✅`);
    }
  }

  console.log("\n\n   ✅ Fixes applied");
}

function generateComparisonReport(
  url: string,
  beforeResults: ScreenshotResult[],
  afterResults: ScreenshotResult[],
  beforeEvals: DeviceEvaluation[],
  afterEvals: DeviceEvaluation[],
  reportDir: string,
  timestamp: string
): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let md = `# Responsive Design Comparison Report

**URL:** ${url}  
**Date:** ${date}  
**Report ID:** ${timestamp}

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| ✅ Good | ${beforeEvals.filter((e) => e.status === "good").length} | ${afterEvals.filter((e) => e.status === "good").length} |
| ⚠️ Minor Issues | ${beforeEvals.filter((e) => e.status === "minor_issues").length} | ${afterEvals.filter((e) => e.status === "minor_issues").length} |
| ❌ Broken | ${beforeEvals.filter((e) => e.status === "broken").length} | ${afterEvals.filter((e) => e.status === "broken").length} |

---

## Before vs After Comparison

`;

  for (let i = 0; i < DEVICES.length; i++) {
    const device = DEVICES[i];
    const before = beforeResults.find((r) => r.device === device.name);
    const after = afterResults.find((r) => r.device === device.name);
    const beforeEval = beforeEvals.find((e) => e.device === device.name);
    const afterEval = afterEvals.find((e) => e.device === device.name);

    const beforeStatus = beforeEval?.status === "good" ? "✅" : beforeEval?.status === "minor_issues" ? "⚠️" : "❌";
    const afterStatus = afterEval?.status === "good" ? "✅" : afterEval?.status === "minor_issues" ? "⚠️" : "❌";

    md += `### ${device.name} (${device.viewport.width}x${device.viewport.height})

**Status:** ${beforeStatus} → ${afterStatus}

| Before | After |
|--------|-------|
| ![Before](./before/${before?.filename}) | ![After](./after/${after?.filename}) |

`;

    if (beforeEval && afterEval) {
      md += `**Before:** ${beforeEval.feedback}

**After:** ${afterEval.feedback}

`;

      // Show what was fixed
      const fixedIssues = beforeEval.issues?.filter(
        (issue) => !afterEval.issues?.includes(issue)
      );
      if (fixedIssues?.length) {
        md += `**Fixed:**
${fixedIssues.map((i) => `- ✅ ${i}`).join("\n")}

`;
      }

      // Show remaining issues
      if (afterEval.issues?.length) {
        md += `**Remaining Issues:**
${afterEval.issues.map((i) => `- ⚠️ ${i}`).join("\n")}

`;
      }
    }

    md += `---

`;
  }

  // Accessibility comparison
  md += `## Accessibility Comparison

| Device | Before Issues | After Issues |
|--------|---------------|--------------|
`;

  for (const device of DEVICES) {
    const before = beforeResults.find((r) => r.device === device.name);
    const after = afterResults.find((r) => r.device === device.name);
    const beforeCount = before?.accessibilityIssues?.length || 0;
    const afterCount = after?.accessibilityIssues?.length || 0;
    const change = afterCount < beforeCount ? "📉" : afterCount === beforeCount ? "➡️" : "📈";

    md += `| ${device.name} | ${beforeCount} | ${afterCount} ${change} |
`;
  }

  md += `
---

## Next Steps

`;

  const remainingIssues = afterEvals.filter(
    (e) => e.status !== "good" || e.accessibility_status !== "good"
  );

  if (remainingIssues.length === 0) {
    md += `✅ **All viewports now pass!** Ready to create a PR.

\`\`\`bash
cd <target-repo>
git add .
git commit -m "fix: responsive design improvements across all viewports"
git push origin <branch>
\`\`\`
`;
  } else {
    md += `⚠️ **${remainingIssues.length} viewports still have issues.** Consider running another fix iteration.

Remaining issues:
${remainingIssues.map((e) => `- ${e.device}: ${e.feedback}`).join("\n")}
`;
  }

  md += `
---

*Report generated by Cursor SDK Full Workflow Tool*
`;

  return md;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
🔄 Full Responsive Fix Workflow

Complete workflow:
1. Takes "before" screenshots with accessibility audit
2. Uses Cursor SDK to implement fixes in target repo
3. Waits for you to restart dev server (if needed)
4. Takes "after" screenshots
5. Generates comparison report (before/after)

Usage:
  npx tsx src/examples/full-workflow.ts <url> <target-repo>

Example:
  npx tsx src/examples/full-workflow.ts http://localhost:5173 /Users/josef/Desktop/projects/solace/solace-web
`);
    process.exit(1);
  }

  const [url, targetRepo] = args;

  if (!existsSync(targetRepo)) {
    console.error(`Error: Target repository not found: ${targetRepo}`);
    process.exit(1);
  }

  console.log("═".repeat(60));
  console.log("🔄 Full Responsive Fix Workflow");
  console.log("═".repeat(60));
  console.log(`\nURL: ${url}`);
  console.log(`Target: ${targetRepo}\n`);

  // Create report directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportDir = join(OUTPUT_DIR, `comparison-${timestamp}`);
  const beforeDir = join(reportDir, "before");
  const afterDir = join(reportDir, "after");
  mkdirSync(reportDir, { recursive: true });

  // Step 1: Before screenshots
  console.log("\n" + "─".repeat(60));
  console.log("STEP 1: Capturing BEFORE state");
  console.log("─".repeat(60));

  const beforeResults = await takeScreenshots(url, beforeDir, "before");
  const { evaluations: beforeEvals, rawResponse: beforeRaw } = await evaluateWithAgent(
    beforeResults,
    url
  );

  // Save before report
  const beforeReportPath = join(reportDir, "before-evaluation.json");
  writeFileSync(
    beforeReportPath,
    JSON.stringify({ evaluations: beforeEvals, raw: beforeRaw }, null, 2)
  );
  console.log(`   📄 Before evaluation saved`);

  // Step 2: Apply fixes
  console.log("\n" + "─".repeat(60));
  console.log("STEP 2: Applying fixes with Cursor SDK");
  console.log("─".repeat(60));

  await applyFixes(beforeEvals, targetRepo, url);

  // Step 3: Wait for dev server
  console.log("\n" + "─".repeat(60));
  console.log("STEP 3: Waiting for changes to take effect");
  console.log("─".repeat(60));
  console.log("\n⏳ Waiting 5 seconds for hot reload...");
  await new Promise((r) => setTimeout(r, 5000));

  // Step 4: After screenshots
  console.log("\n" + "─".repeat(60));
  console.log("STEP 4: Capturing AFTER state");
  console.log("─".repeat(60));

  const afterResults = await takeScreenshots(url, afterDir, "after");
  const { evaluations: afterEvals, rawResponse: afterRaw } = await evaluateWithAgent(
    afterResults,
    url
  );

  // Save after report
  const afterReportPath = join(reportDir, "after-evaluation.json");
  writeFileSync(
    afterReportPath,
    JSON.stringify({ evaluations: afterEvals, raw: afterRaw }, null, 2)
  );
  console.log(`   📄 After evaluation saved`);

  // Step 5: Generate comparison report
  console.log("\n" + "─".repeat(60));
  console.log("STEP 5: Generating comparison report");
  console.log("─".repeat(60));

  const comparisonMd = generateComparisonReport(
    url,
    beforeResults,
    afterResults,
    beforeEvals,
    afterEvals,
    reportDir,
    timestamp
  );

  const comparisonPath = join(reportDir, "comparison.md");
  writeFileSync(comparisonPath, comparisonMd);
  console.log(`\n   ✅ Comparison report saved: ${comparisonPath}`);

  // Generate PDF
  const stylesheetPath = join(__dirname, "..", "report-style.css");
  const pdfPath = join(reportDir, "comparison.pdf");
  try {
    await mdToPdf(
      { path: comparisonPath },
      {
        dest: pdfPath,
        pdf_options: {
          format: "A4",
          margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
          printBackground: true,
        },
        stylesheet: [stylesheetPath],
      }
    );
    console.log(`   ✅ PDF saved: ${pdfPath}`);
  } catch {
    console.log(`   ⚠️  PDF generation failed`);
  }

  // Final summary
  console.log("\n" + "═".repeat(60));
  console.log("✅ WORKFLOW COMPLETE");
  console.log("═".repeat(60));
  console.log(`
📁 Report: ${reportDir}
   • comparison.md  - Markdown comparison report
   • comparison.pdf - PDF report
   • before/        - Before screenshots
   • after/         - After screenshots

📊 Results:
   Before: ${beforeEvals.filter((e) => e.status === "good").length}/${beforeEvals.length} good
   After:  ${afterEvals.filter((e) => e.status === "good").length}/${afterEvals.length} good

🚀 Next steps:
   cd ${targetRepo}
   git diff                    # Review changes
   git add .
   git commit -m "fix: responsive design improvements"
   git push
`);
}

main().catch(console.error);
