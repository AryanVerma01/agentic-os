// services/evals/runner.ts
import fs from "fs";
import path from "path";
// Import your actual agent entrypoint (adjust path to your monorepo setup)
import { runOrchestrator } from "../../apps/api/src/langgraph/orchestrator";
import { judgeWithLLM } from "./llm-judge";

type Fixture = {
  id: string;
  input: string;
  expected:
  | { type: "exact"; value: string }
  | { type: "contains"; value: string }
  | { type: "llm-judge"; rubric: string };
};

async function main() {
  // Support running a single fixture: `ts-node runner.ts --fixture guardrail-refusal`
  const targetId = process.argv.includes("--fixture")
    ? process.argv[process.argv.indexOf("--fixture") + 1]
    : null;

  const raw = fs.readFileSync(path.join(__dirname, "fixtures.json"), "utf8");
  const fixtures: Fixture[] = JSON.parse(raw);

  let passed = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    if (targetId && fixture.id !== targetId) continue;

    console.log(`\n▶ Running: ${fixture.id}...`);

    // Execute the agent natively (bypassing HTTP for speed and direct code testing)
    const result = await runOrchestrator(fixture.input);
    const output = result.output;

    let isPass = false;
    let reason = "";

    // 1. Evaluate Output
    switch (fixture.expected.type) {
      case "exact":
        isPass = output.trim() === fixture.expected.value;
        reason = `Expected exact match: "${fixture.expected.value}"`;
        break;
      case "contains":
        isPass = output.includes(fixture.expected.value);
        reason = `Expected to contain: "${fixture.expected.value}"`;
        break;
      case "llm-judge":
        const judgeRes = await judgeWithLLM(fixture.input, output, fixture.expected.rubric);
        isPass = judgeRes.pass;
        reason = judgeRes.reason;
        break;
    }

    // 2. Report Result
    if (isPass) {
      console.log(`✅ PASS (${result.promptVersion})`);
      passed++;
    } else {
      console.log(`❌ FAIL (${result.promptVersion})`);
      console.log(`   Output: ${output}`);
      console.log(`   Reason: ${reason}`);
      failed++;
    }
  }

  console.log(`\n--- EVAL SUMMARY ---`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);

  // Exit with non-zero code if any failed (so CI pipeline breaks)
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);