# Cursor SDK Demo

> Built at the Cursor Hackathon in Stockholm 🇸🇪

A collection of tools for automated responsive design testing and fixing using the [Cursor SDK (Alpha)](https://cursor.com/docs/january).

## What This Does

This project demonstrates how to use the Cursor SDK programmatically to:

1. **Take screenshots** of web pages across multiple device viewports
2. **Evaluate UI quality** using AI to detect responsive design issues
3. **Audit accessibility** using Puppeteer's accessibility APIs
4. **Automatically fix issues** by having the Cursor agent modify your codebase
5. **Generate comparison reports** showing before/after improvements

## Quick Start

```bash
# Install dependencies
npm install

# Set your Cursor API key
echo "CURSOR_API_KEY=your_api_key" > .env

# Run viewport test on any URL
npm run viewport-test -- http://localhost:3000
```

## Features

### 📸 Multi-Viewport Screenshot Testing

Test your app across 4 device viewports simultaneously:

| Device | Resolution | Type |
|--------|------------|------|
| iPhone 15 Pro | 393×852 | Mobile |
| Pixel 7 | 412×915 | Mobile |
| Laptop 13" | 1600×900 | Desktop |
| Ultrawide | 2560×1080 | Wide |

```bash
npm run viewport-test -- http://localhost:5173
```

Generates a Markdown + PDF report with AI evaluation of each viewport.

### ♿ Accessibility Auditing

Include accessibility checks using Puppeteer's `Accessibility.snapshot()`:

```bash
npm run viewport-test -- http://localhost:5173 --accessibility
```

Checks for:
- Missing alt text on images
- Touch targets below 44×44px (mobile)
- Form inputs without labels
- Missing landmarks (`<main>`, `<nav>`)
- Missing heading structure

### 🔧 Automated Fixes with Cursor SDK

Point the Cursor agent at your codebase to automatically implement responsive design fixes:

```bash
npm run fix-responsive -- output/report-XXX /path/to/your/repo
```

The agent will:
1. Explore your codebase structure
2. Find relevant CSS/component files
3. Implement media queries and responsive layouts
4. Add accessibility attributes

### 🔄 Full Workflow (Before → Fix → After → Compare)

Run the complete cycle automatically:

```bash
npm run full-workflow -- http://localhost:5173 /path/to/your/repo
```

This will:
1. Take "before" screenshots
2. Use Cursor SDK to implement fixes
3. Wait for hot reload
4. Take "after" screenshots
5. Generate a comparison report with side-by-side images

### 🔐 Session Persistence

Log in once, and your session persists for future tests:

```bash
# Open browser to log in manually
npm run screenshot:login -- http://localhost:5173

# Future tests use saved session
npm run viewport-test -- http://localhost:5173/dashboard
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run basic Cursor agent demo |
| `npm run screenshot -- <url> "<task>"` | Single screenshot + AI evaluation |
| `npm run screenshot:login -- <url>` | Login mode (saves session) |
| `npm run viewport-test -- <url>` | Multi-viewport test with report |
| `npm run viewport-test -- <url> --accessibility` | Include accessibility audit |
| `npm run viewport-test -- <url> --compare <dir>` | Compare with previous report |
| `npm run fix-responsive -- <report> <repo>` | Apply fixes from report |
| `npm run full-workflow -- <url> <repo>` | Complete before/fix/after cycle |

## Output Structure

```
output/
├── report-YYYY-MM-DDTHH-MM-SS/
│   ├── report.md           # Markdown report
│   ├── report.pdf          # PDF with embedded screenshots
│   └── images/             # Screenshots per viewport
│
└── comparison-YYYY-MM-DDTHH-MM-SS/
    ├── comparison.md       # Before/after comparison
    ├── comparison.pdf      # PDF comparison report
    ├── before/             # Before screenshots
    ├── after/              # After screenshots
    └── *-evaluation.json   # Raw AI evaluations
```

## Project Structure

```
cursor-cli-demo/
├── src/
│   ├── index.ts                    # Basic Cursor agent demo
│   ├── report-style.css            # PDF styling
│   └── examples/
│       ├── stream.ts               # Streaming response example
│       ├── callbacks.ts            # Callbacks example
│       ├── interactive.ts          # Interactive chat REPL
│       ├── screenshot-test.ts      # Single screenshot tool
│       ├── viewport-test.ts        # Multi-viewport testing
│       ├── fix-responsive.ts       # Apply fixes from report
│       └── full-workflow.ts        # Complete before/after workflow
├── output/                         # Generated reports
├── screenshots/                    # Individual screenshots
├── .browser-profile/               # Persistent browser session
└── .env                            # CURSOR_API_KEY
```

## Requirements

- Node.js 18+
- [Cursor API Key](https://cursor.com/dashboard?tab=integrations)
- ripgrep (`brew install ripgrep`)

## How It Works

1. **Puppeteer** opens a headless browser and captures screenshots at different viewport sizes
2. **Cursor SDK** sends screenshots to the AI agent for evaluation
3. The agent uses its built-in **read tool** to view the images
4. AI provides structured feedback with specific CSS/code fix suggestions
5. When fixing, the agent targets your repository and implements changes using its **edit tools**

## Example Report Output

```markdown
## Summary

| Status | Count |
|--------|-------|
| ✅ Good | 2 |
| ⚠️ Minor Issues | 1 |
| ❌ Broken | 1 |

### Ultrawide (2560x1080) - ❌ Broken

**Issues Found:**
- Content constrained to narrow center column
- Cards remain single-column when screen can accommodate 2-3 columns

**Suggestions:**
- Implement CSS Grid: `grid-template-columns: repeat(auto-fit, minmax(400px, 1fr))`
- Add max-width constraint: `.main-content { max-width: 1400px; margin: 0 auto; }`
```

## License

MIT

---

*Built with ☕ at Cursor Hackathon Stockholm 2026*
