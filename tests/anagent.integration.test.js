#!/usr/bin/env node

/**
 * Integration tests for anagent runtime
 *
 * Tests:
 * 1. anagent CLI is available (installed or via npx)
 * 2. anagent responds to a simple factual question
 */

const { execSync } = require("child_process");

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

function log(msg, color = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}
function logTest(name) { log(`\n▶ ${name}`, "blue"); }
function logSuccess(msg) { log(`  ✓ ${msg}`, "green"); }
function logError(msg) { log(`  ✗ ${msg}`, "red"); }
function logInfo(msg) { log(`  ℹ ${msg}`, "gray"); }

function resolveAnagentCmd() {
  try {
    execSync("anagent --version", { stdio: "pipe" });
    return "anagent";
  } catch {
    return "npx --yes github:arthuracrs/anagent";
  }
}

// Test 1: CLI is reachable and prints a version
function testCliAvailable(cmd) {
  logTest("Test 1: anagent CLI is available");
  const out = execSync(`${cmd} --version`, { encoding: "utf8", stdio: "pipe" }).trim();
  if (!out) throw new Error("No version output");
  logSuccess(`version: ${out}`);
}

// Test 2: Responds correctly to a factual geography question
function testCapitalOfBrazil(cmd) {
  logTest("Test 2: What is the capital of Brazil?");
  logInfo("Running prompt via anagent (may take a moment)…");

  const raw = execSync(
    `${cmd} run "What is the capital of Brazil? Answer in one sentence." --json`,
    { encoding: "utf8", stdio: "pipe", timeout: 120_000 }
  );

  logInfo(`raw output: ${raw.trim().slice(0, 200)}`);

  let output;
  try {
    output = JSON.parse(raw).output;
  } catch {
    throw new Error(`Expected JSON output, got: ${raw.trim().slice(0, 200)}`);
  }

  if (!output) throw new Error("JSON response missing 'output' field");

  const lower = output.toLowerCase();
  if (!lower.includes("brasília") && !lower.includes("brasilia")) {
    throw new Error(`Expected 'Brasília' in response, got: ${output.slice(0, 300)}`);
  }

  logSuccess(`Response mentions Brasília: "${output.trim().slice(0, 120)}…"`);
}

async function runTests() {
  log("\n╔════════════════════════════════════════╗", "blue");
  log("║  anagent Integration Tests             ║", "blue");
  log("╚════════════════════════════════════════╝", "blue");

  const cmd = resolveAnagentCmd();
  logInfo(`Using: ${cmd}`);

  const results = { passed: 0, failed: 0, total: 0 };

  const tests = [
    () => testCliAvailable(cmd),
    () => testCapitalOfBrazil(cmd),
  ];

  for (const t of tests) {
    results.total++;
    try {
      t();
      results.passed++;
    } catch (err) {
      logError(err.message);
      results.failed++;
    }
  }

  log("\n╔════════════════════════════════════════╗", "blue");
  log("║  Test Summary                          ║", "blue");
  log("╚════════════════════════════════════════╝", "blue");
  log(`\nTotal: ${results.total}`, "blue");
  log(`Passed: ${results.passed}`, results.passed === results.total ? "green" : "gray");
  log(`Failed: ${results.failed}`, results.failed > 0 ? "red" : "green");

  if (results.failed > 0) {
    log("\n❌ Some tests failed", "red");
    process.exit(1);
  } else {
    log("\n✅ All tests passed!", "green");
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    logError(`Test suite error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runTests };
