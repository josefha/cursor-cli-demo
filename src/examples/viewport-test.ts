/**
 * Multi-Viewport Screenshot Testing with Report Generation
 * 
 * Takes screenshots of a page across multiple device viewports,
 * evaluates the UI, and generates a Markdown + PDF report.
 * 
 * Usage:
 *   npx tsx src/examples/viewport-test.ts <url> [options]
 * 
 * Options:
 *   --accessibility    Include accessibility audit
 *   --compare <dir>    Compare with previous report (before/after)
 * 
 * Examples:
 *   npx tsx src/examples/viewport-test.ts http://localhost:5173
 *   npx tsx src/examples/viewport-test.ts http://localhost:5173 --accessibility
 *   npx tsx src/examples/viewport-test.ts http://localhost:5173 --compare output/report-2026-01-14T18-49-04
 */

import "dotenv/config";
import puppeteer, { Viewport } from "puppeteer";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
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

// User agents
const USER_AGENTS = {
  iPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

// Device configurations
const DEVICES: DeviceConfig[] = [
  {
    name: "iPhone 15 Pro",
    viewport: {
      width: 393,
      height: 852,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
    userAgent: USER_AGENTS.iPhone,
  },
  {
    name: "Android (Pixel 7)",
    viewport: {
      width: 412,
      height: 915,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
    userAgent: USER_AGENTS.Android,
  },
  {
    name: "Laptop 13-inch (1600x900)",
    viewport: {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    name: "Ultrawide (2560x1080)",
    viewport: {
      width: 2560,
      height: 1080,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
];

interface AccessibilityIssue {
  type: string;
  description: string;
  element?: string;
  suggestion?: string;
}

interface ScreenshotResult {
  device: string;
  path: string;
  filename: string;
  viewport: Viewport;
  accessibilitySnapshot?: object;
  accessibilityIssues?: AccessibilityIssue[];
}

async function takeMultiViewportScreenshots(
  url: string,
  reportDir: string,
  options: { waitTime?: number; includeAccessibility?: boolean } = {}
): Promise<ScreenshotResult[]> {
  const { waitTime = 2000, includeAccessibility = false } = options;

  console.log(`🌐 Testing URL: ${url}`);
  if (includeAccessibility) {
    console.log(`♿ Accessibility audit: enabled`);
  }
  console.log("");

  mkdirSync(USER_DATA_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    userDataDir: USER_DATA_DIR,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const imagesDir = join(reportDir, "images");
  mkdirSync(imagesDir, { recursive: true });

  const results: ScreenshotResult[] = [];

  for (const device of DEVICES) {
    console.log(`📱 ${device.name} (${device.viewport.width}x${device.viewport.height})`);

    const page = await browser.newPage();
    await page.setViewport(device.viewport);

    if (device.userAgent) {
      await page.setUserAgent(device.userAgent);
    }

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    } catch {
      console.log(`   ⚠️  Page load timeout, continuing...`);
    }

    await new Promise((resolve) => setTimeout(resolve, waitTime));

    const safeName = device.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const filename = `${safeName}.png`;
    const screenshotPath = join(imagesDir, filename);

    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`   ✅ Screenshot saved`);

    const result: ScreenshotResult = {
      device: device.name,
      path: screenshotPath,
      filename,
      viewport: device.viewport,
    };

    // Accessibility audit
    if (includeAccessibility) {
      console.log(`   ♿ Running accessibility audit...`);
      try {
        const accessibilitySnapshot = await page.accessibility.snapshot();
        result.accessibilitySnapshot = accessibilitySnapshot || undefined;

        // Analyze accessibility issues
        const issues = await analyzeAccessibility(page, device);
        result.accessibilityIssues = issues;

        if (issues.length > 0) {
          console.log(`   ⚠️  ${issues.length} accessibility issues found`);
        } else {
          console.log(`   ✅ No major accessibility issues`);
        }
      } catch (error) {
        console.log(`   ⚠️  Accessibility audit failed: ${error}`);
      }
    }

    results.push(result);
    await page.close();
  }

  await browser.close();
  return results;
}

interface A11yCheckResults {
  missingAltText: string[];
  smallTouchTargets: string[];
  missingLabels: string[];
  missingLandmarks: boolean;
  missingHeadings: boolean;
}

async function analyzeAccessibility(
  page: puppeteer.Page,
  device: DeviceConfig
): Promise<AccessibilityIssue[]> {
  const issues: AccessibilityIssue[] = [];

  // Check for common accessibility issues
  const checks = await page.evaluate((isMobile) => {
    const results = {
      missingAltText: [] as string[],
      smallTouchTargets: [] as string[],
      missingLabels: [] as string[],
      missingLandmarks: false,
      missingHeadings: false,
    };

    // Check images without alt text
    document.querySelectorAll("img").forEach((img: HTMLImageElement) => {
      if (!img.alt && !img.getAttribute("aria-label")) {
        results.missingAltText.push(img.src.slice(-50));
      }
    });

    // Check for small touch targets on mobile
    if (isMobile) {
      document
        .querySelectorAll("button, a, input, select, [role='button']")
        .forEach((el: Element) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 44 || rect.height < 44) {
            const text =
              el.textContent?.slice(0, 30) ||
              el.getAttribute("aria-label") ||
              "unknown";
            results.smallTouchTargets.push(text);
          }
        });
    }

    // Check form inputs without labels
    document.querySelectorAll("input, select, textarea").forEach((input: Element) => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAriaLabel = input.getAttribute("aria-label");
      const hasAriaLabelledBy = input.getAttribute("aria-labelledby");

      if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) {
        results.missingLabels.push(
          input.getAttribute("name") || input.getAttribute("type") || "unknown"
        );
      }
    });

    // Check for landmarks
    const hasMain = !!document.querySelector("main, [role='main']");
    const hasNav = !!document.querySelector("nav, [role='navigation']");
    results.missingLandmarks = !hasMain || !hasNav;

    // Check for headings
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    results.missingHeadings = headings.length === 0;

    return results;
  }, device.viewport.isMobile || false) as A11yCheckResults;

  // Convert to issues
  if (checks.missingAltText.length > 0) {
    issues.push({
      type: "missing-alt-text",
      description: `${checks.missingAltText.length} images missing alt text`,
      element: checks.missingAltText.slice(0, 3).join(", "),
      suggestion: 'Add descriptive alt="" attributes to all images',
    });
  }

  if (checks.smallTouchTargets.length > 0) {
    issues.push({
      type: "small-touch-target",
      description: `${checks.smallTouchTargets.length} interactive elements below 44x44px minimum`,
      element: checks.smallTouchTargets.slice(0, 3).join(", "),
      suggestion:
        "Increase min-width and min-height to 44px for touch targets",
    });
  }

  if (checks.missingLabels.length > 0) {
    issues.push({
      type: "missing-label",
      description: `${checks.missingLabels.length} form inputs missing accessible labels`,
      element: checks.missingLabels.slice(0, 3).join(", "),
      suggestion:
        "Add <label> elements or aria-label attributes to form inputs",
    });
  }

  if (checks.missingLandmarks) {
    issues.push({
      type: "missing-landmarks",
      description: "Page missing main structural landmarks",
      suggestion:
        "Add <main>, <nav>, <header>, <footer> elements for screen reader navigation",
    });
  }

  if (checks.missingHeadings) {
    issues.push({
      type: "missing-headings",
      description: "Page has no heading elements",
      suggestion:
        "Add hierarchical headings (h1-h6) for document structure and screen reader navigation",
    });
  }

  return issues;
}

interface DeviceEvaluation {
  device: string;
  resolution: string;
  status: string;
  feedback: string;
  issues: string[];
  suggestions: string[];
}

async function evaluateScreenshots(
  results: ScreenshotResult[],
  url: string,
  options: { customTask?: string; includeAccessibility?: boolean } = {}
): Promise<{ evaluations: DeviceEvaluation[]; rawResponse: string }> {
  const { customTask, includeAccessibility } = options;

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

  console.log(`\n🤖 Sending screenshots to Cursor Agent for evaluation...`);

  const screenshotList = results
    .map(
      (r) => `- ${r.device} (${r.viewport.width}x${r.viewport.height}): ${r.path}`
    )
    .join("\n");

  // Add accessibility issues to context if enabled
  let accessibilityContext = "";
  if (includeAccessibility) {
    accessibilityContext = `\n\n## Accessibility Audit Results\n`;
    for (const result of results) {
      if (result.accessibilityIssues && result.accessibilityIssues.length > 0) {
        accessibilityContext += `\n### ${result.device}\n`;
        for (const issue of result.accessibilityIssues) {
          accessibilityContext += `- **${issue.type}**: ${issue.description}\n`;
          if (issue.suggestion) {
            accessibilityContext += `  - Suggestion: ${issue.suggestion}\n`;
          }
        }
      }
    }
  }

  const defaultTask = `Evaluate if the UI looks good or broken in each viewport.`;
  const task = customTask || defaultTask;

  const accessibilityInstructions = includeAccessibility
    ? `\n- Include accessibility issues in your evaluation\n- Rate accessibility separately (A11y: ✅ Good, ⚠️ Issues, ❌ Critical)`
    : "";

  const prompt = `I've taken screenshots of ${url} across multiple device viewports for responsive design testing.

## Screenshots taken:
${screenshotList}
${accessibilityContext}

## Task:
${task}

Please read/view each screenshot and provide evaluation in this EXACT JSON format (output ONLY valid JSON, no markdown):

{
  "evaluations": [
    {
      "device": "Device Name",
      "resolution": "WIDTHxHEIGHT",
      "status": "good" | "minor_issues" | "broken",
      "feedback": "Brief overall feedback",
      "issues": ["Issue 1", "Issue 2"],
      "suggestions": ["Specific CSS/code fix suggestion 1", "Suggestion 2"]${includeAccessibility ? ',\n      "accessibility_status": "good" | "issues" | "critical",\n      "accessibility_issues": ["A11y issue 1"]' : ""}
    }
  ],
  "summary": "Overall summary of responsive design quality",
  "priority_fixes": ["Most important fix 1", "Fix 2", "Fix 3"]
}

Be specific in suggestions - include CSS properties, selectors, or component names when possible.${accessibilityInstructions}
Output ONLY the JSON, no other text.`;

  const { stream } = agent.submit({ message: prompt });

  let rawResponse = "";
  for await (const delta of stream) {
    if (delta.type === "text-delta") {
      rawResponse += delta.text;
      process.stdout.write(delta.text);
    } else if (delta.type === "tool-call-started") {
      console.log(`\n🔧 Reading screenshot...`);
    } else if (delta.type === "tool-call-completed") {
      console.log(`✅ Done`);
    }
  }

  // Parse JSON from response
  let evaluations: DeviceEvaluation[] = [];
  try {
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      evaluations = parsed.evaluations || [];
    }
  } catch {
    console.log("\n⚠️  Could not parse structured response, using raw output");
  }

  return { evaluations, rawResponse };
}

function generateMarkdownReport(
  url: string,
  results: ScreenshotResult[],
  evaluations: DeviceEvaluation[],
  rawResponse: string,
  timestamp: string,
  options: { includeAccessibility?: boolean; compareDir?: string } = {}
): string {
  const { includeAccessibility, compareDir } = options;

  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let md = `# Responsive Design Evaluation Report

**URL:** ${url}  
**Date:** ${date}  
**Report ID:** ${timestamp}
${includeAccessibility ? "**Accessibility Audit:** Included ♿\n" : ""}
---

## Summary

`;

  if (evaluations.length > 0) {
    const statusCounts = {
      good: evaluations.filter((e) => e.status === "good").length,
      minor_issues: evaluations.filter((e) => e.status === "minor_issues").length,
      broken: evaluations.filter((e) => e.status === "broken").length,
    };

    md += `| Status | Count |
|--------|-------|
| ✅ Good | ${statusCounts.good} |
| ⚠️ Minor Issues | ${statusCounts.minor_issues} |
| ❌ Broken | ${statusCounts.broken} |

`;
  }

  // Accessibility summary
  if (includeAccessibility) {
    const totalA11yIssues = results.reduce(
      (sum, r) => sum + (r.accessibilityIssues?.length || 0),
      0
    );
    md += `### Accessibility Summary

**Total Issues Found:** ${totalA11yIssues}

`;
  }

  md += `---

## Device Evaluations

`;

  // Comparison mode
  if (compareDir) {
    md += `> 📊 **Comparison Mode:** Showing before (left) and after (right) screenshots\n\n`;
  }

  for (const result of results) {
    const evaluation = evaluations.find((e) => e.device === result.device);
    const statusIcon =
      evaluation?.status === "good"
        ? "✅"
        : evaluation?.status === "minor_issues"
          ? "⚠️"
          : evaluation?.status === "broken"
            ? "❌"
            : "📱";

    md += `### ${statusIcon} ${result.device} (${result.viewport.width}x${result.viewport.height})

`;

    // Comparison view
    if (compareDir) {
      const beforeImage = join(compareDir, "images", result.filename);
      if (existsSync(beforeImage)) {
        md += `| Before | After |
|--------|-------|
| ![Before](${beforeImage}) | ![After](./images/${result.filename}) |

`;
      } else {
        md += `![${result.device} Screenshot](./images/${result.filename})

`;
      }
    } else {
      md += `![${result.device} Screenshot](./images/${result.filename})

`;
    }

    if (evaluation) {
      md += `**Status:** ${evaluation.status.replace("_", " ").toUpperCase()}

**Feedback:** ${evaluation.feedback}

`;

      if (evaluation.issues && evaluation.issues.length > 0) {
        md += `**Issues Found:**
${evaluation.issues.map((i) => `- ${i}`).join("\n")}

`;
      }

      if (evaluation.suggestions && evaluation.suggestions.length > 0) {
        md += `**Suggestions:**
${evaluation.suggestions.map((s) => `- ${s}`).join("\n")}

`;
      }
    }

    // Accessibility issues for this device
    if (includeAccessibility && result.accessibilityIssues?.length) {
      md += `**Accessibility Issues:**
${result.accessibilityIssues.map((i) => `- **${i.type}**: ${i.description}${i.suggestion ? ` (Fix: ${i.suggestion})` : ""}`).join("\n")}

`;
    }

    md += `---

`;
  }

  // Suggested modifications section
  md += `## Suggested Modifications

This section contains actionable fixes that can be fed to the Cursor SDK coding agent.

\`\`\`markdown
# Responsive Design Fixes Required

URL: ${url}

## Priority Fixes

`;

  if (evaluations.length > 0) {
    const allSuggestions = evaluations.flatMap((e) => e.suggestions || []);
    const uniqueSuggestions = [...new Set(allSuggestions)];

    if (uniqueSuggestions.length > 0) {
      uniqueSuggestions.forEach((s, i) => {
        md += `${i + 1}. ${s}\n`;
      });
    } else {
      md += `No specific fixes required - all viewports look good!\n`;
    }

    md += `
## Device-Specific Issues

`;

    for (const evaluation of evaluations) {
      if (evaluation.issues && evaluation.issues.length > 0) {
        md += `### ${evaluation.device} (${evaluation.resolution})
${evaluation.issues.map((i) => `- [ ] ${i}`).join("\n")}

`;
      }
    }
  }

  // Accessibility fixes
  if (includeAccessibility) {
    md += `
## Accessibility Fixes

`;
    const allA11yIssues = results.flatMap((r) => r.accessibilityIssues || []);
    const uniqueTypes = [...new Set(allA11yIssues.map((i) => i.type))];

    for (const type of uniqueTypes) {
      const issue = allA11yIssues.find((i) => i.type === type);
      if (issue) {
        md += `- [ ] **${type}**: ${issue.suggestion || issue.description}\n`;
      }
    }
  }

  md += `\`\`\`

---

## Raw AI Evaluation

<details>
<summary>Click to expand full AI response</summary>

\`\`\`
${rawResponse}
\`\`\`

</details>

---

*Report generated by Cursor SDK Viewport Test Tool*
`;

  return md;
}

async function generatePdf(
  markdownPath: string,
  pdfPath: string
): Promise<void> {
  console.log(`📄 Generating PDF...`);

  const stylesheetPath = join(__dirname, "..", "report-style.css");

  try {
    await mdToPdf(
      { path: markdownPath },
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
  } catch (error) {
    console.log(`   ⚠️  PDF generation failed, markdown report is still available`);
    console.log(`   Error: ${error}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let url = "";
  let customTask = "";
  let includeAccessibility = false;
  let compareDir = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--accessibility") {
      includeAccessibility = true;
    } else if (args[i] === "--compare" && args[i + 1]) {
      compareDir = args[i + 1];
      i++;
    } else if (!url) {
      url = args[i];
    } else if (!customTask) {
      customTask = args[i];
    }
  }

  if (!url) {
    console.log(`
📱 Multi-Viewport Screenshot Test with Report Generation

Tests a page across multiple device viewports and generates a report.

Usage:
  npx tsx src/examples/viewport-test.ts <url> [options] ["<task>"]

Options:
  --accessibility     Include accessibility audit (uses Puppeteer Accessibility.snapshot)
  --compare <dir>     Compare with previous report (generates before/after view)

Viewports tested:
  • iPhone 15 Pro (393x852) - Mobile iOS
  • Pixel 7 (412x915) - Mobile Android  
  • Laptop 13" (1600x900) - Standard laptop
  • Ultrawide (2560x1080) - Wide monitor

Examples:
  npx tsx src/examples/viewport-test.ts http://localhost:5173
  npx tsx src/examples/viewport-test.ts http://localhost:5173 --accessibility
  npx tsx src/examples/viewport-test.ts http://localhost:5173 --compare output/report-2026-01-14T18-49-04

Environment:
  WAIT_TIME=3000  - Wait time in ms after page load (default: 2000)
`);
    process.exit(1);
  }

  const waitTime = parseInt(process.env.WAIT_TIME || "2000", 10);

  console.log("🚀 Multi-Viewport Screenshot Test\n");

  // Create timestamped report directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportDir = join(OUTPUT_DIR, `report-${timestamp}`);
  mkdirSync(reportDir, { recursive: true });

  // Take screenshots
  const results = await takeMultiViewportScreenshots(url, reportDir, {
    waitTime,
    includeAccessibility,
  });
  console.log(`\n📸 ${results.length} screenshots captured.`);

  // Evaluate with AI
  const { evaluations, rawResponse } = await evaluateScreenshots(results, url, {
    customTask,
    includeAccessibility,
  });

  // Generate markdown report
  console.log(`\n📝 Generating report...`);
  const markdown = generateMarkdownReport(
    url,
    results,
    evaluations,
    rawResponse,
    timestamp,
    { includeAccessibility, compareDir }
  );

  const markdownPath = join(reportDir, "report.md");
  writeFileSync(markdownPath, markdown);
  console.log(`   ✅ Markdown saved: ${markdownPath}`);

  // Generate PDF
  const pdfPath = join(reportDir, "report.pdf");
  await generatePdf(markdownPath, pdfPath);

  // Summary
  console.log(`
─────────────────────────────────────────────────────────────
📁 Report saved to: ${reportDir}

Files:
  • report.md    - Markdown (feed to Cursor SDK for fixes)
  • report.pdf   - PDF (for review/sharing)
  • images/      - Screenshots

${compareDir ? `📊 Compared with: ${compareDir}\n` : ""}${includeAccessibility ? "♿ Accessibility audit included\n" : ""}
To fix issues with Cursor SDK:
  npx tsx src/examples/fix-responsive.ts ${reportDir} <target-repo>
─────────────────────────────────────────────────────────────
`);
}

main().catch(console.error);
