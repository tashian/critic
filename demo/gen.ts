#!/usr/bin/env bun
/**
 * Generate synthetic Claude Code transcripts for the Critic demo.
 *
 *   $DEMO_DIR/history/<project>/*.jsonl   ~30 past sessions (the baseline Critic compares against)
 *   $DEMO_DIR/live/<project>/<scenario>.jsonl   one "live" session per mood
 *
 * Nothing here touches ~/.claude. Point Critic at it with
 * CRITIC_PROJECTS_DIR=$DEMO_DIR/history CRITIC_DIR=$DEMO_DIR/state.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEMO_DIR = process.env.DEMO_DIR ?? join(process.env.TMPDIR ?? "/tmp", "critic-demo");
const MIN = 60_000;

// ---------- transcript builder ----------

interface Tool {
  name: string;
  input: Record<string, unknown>;
  error?: string;
  reject?: boolean;
}
interface Ex {
  p: string;
  /** Minutes between the previous exchange ending and this prompt. */
  gap?: number;
  /** Minutes the assistant works on it. */
  dur?: number;
  say?: string;
  tools?: Tool[];
  interrupt?: boolean;
  done?: string;
}

const read = (f: string): Tool => ({ name: "Read", input: { file_path: f } });
const grep = (p: string): Tool => ({ name: "Grep", input: { pattern: p } });
const edit = (f: string): Tool => ({ name: "Edit", input: { file_path: f, old_string: "…", new_string: "…" } });
const write = (f: string): Tool => ({ name: "Write", input: { file_path: f, content: "…" } });
const sh = (command: string, error?: string): Tool => ({ name: "Bash", input: { command }, error });
const test = (t = "bun test", error?: string) => sh(t, error);
const commit = (m: string) => sh(`git commit -am "${m}"`);

function build(sessionId: string, title: string, cwd: string, start: number, exs: Ex[]): string {
  const out: object[] = [{ type: "ai-title", title, sessionId }];
  let t = start;
  let n = 0;
  const ts = () => new Date(t).toISOString();
  const base = () => ({ sessionId, cwd, timestamp: ts(), uuid: `${sessionId}-${n++}` });
  for (const e of exs) {
    t += (e.gap ?? 1.5) * MIN;
    out.push({ ...base(), type: "user", message: { role: "user", content: e.p } });
    const tools = e.tools ?? [];
    const dur = (e.dur ?? 2 + tools.length * 0.7) * MIN;
    t += 0.2 * MIN;
    const ids = tools.map((_, i) => `toolu_${sessionId.slice(0, 8)}_${n}_${i}`);
    out.push({
      ...base(),
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          ...(e.say ? [{ type: "text", text: e.say }] : []),
          ...tools.map((tl, i) => ({ type: "tool_use", id: ids[i], name: tl.name, input: tl.input })),
        ],
      },
    });
    if (tools.length) {
      t += dur;
      out.push({
        ...base(),
        type: "user",
        message: {
          role: "user",
          content: tools.map((tl, i) => ({
            type: "tool_result",
            tool_use_id: ids[i],
            is_error: !!(tl.error || tl.reject),
            content: tl.reject
              ? "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file)."
              : (tl.error ?? "ok"),
          })),
        },
      });
    } else t += dur;
    if (e.interrupt) {
      t += 0.3 * MIN;
      out.push({ ...base(), type: "user", message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] } });
    } else if (e.done) {
      t += 0.1 * MIN;
      out.push({ ...base(), type: "assistant", message: { role: "assistant", content: [{ type: "text", text: e.done }] } });
    }
  }
  return out.map((o) => JSON.stringify(o)).join("\n") + "\n";
}

/** Length of a session in ms, so live sessions can be placed to end "just now". */
function span(exs: Ex[]): number {
  return exs.reduce((s, e) => s + (e.gap ?? 1.5) + 0.2 + (e.dur ?? 2 + (e.tools?.length ?? 0) * 0.7) + 0.3, 0) * MIN;
}

const projDir = (root: string, project: string) => join(root, `-Users-demo-code-${project}`);

// ---------- live scenarios, one per mood ----------

const SCENARIOS: Record<string, { project: string; title: string; exs: Ex[] }> = {
  peak: {
    project: "acme-api",
    title: "Per-key rate limiting for /v1",
    exs: [
      {
        p: "Goal: per-API-key rate limiting on the public /v1 API. Done = `bun test src/ratelimit` passes and /v1/* returns 429 with a Retry-After header when a key is over its limit. Read src/middleware/ and src/routes/v1.ts, then propose a plan before you edit anything.",
        tools: [read("src/middleware/auth.ts"), read("src/routes/v1.ts"), grep("redis")],
        say: "Plan: token bucket per key in Redis, applied as middleware after auth. 1) failing tests, 2) Lua script for atomic take, 3) wire into v1 router, 4) headers.",
      },
      {
        p: "Plan is right. Use a Lua script so take() is atomic. Write the failing tests first: under limit, over limit, refill after 1s.",
        tools: [write("src/ratelimit/bucket.test.ts"), test("bun test src/ratelimit")],
        say: "3 tests written, all failing as expected (module not found).",
      },
      {
        p: "Implement it until those three pass. Don't touch the auth middleware.",
        tools: [write("src/ratelimit/bucket.ts"), write("src/ratelimit/take.lua"), test("bun test src/ratelimit")],
        done: "3/3 passing.",
      },
      { p: "Green. Commit it.", tools: [commit("ratelimit: token bucket with atomic Lua take")], dur: 0.5 },
      {
        p: "Wire it into the /v1 router. Limits come from the key's plan tier: free=60/min, pro=600/min. Add a route-level test that hits /v1/projects 61 times as a free key.",
        tools: [edit("src/routes/v1.ts"), edit("src/ratelimit/limits.ts"), write("src/routes/v1.ratelimit.test.ts"), test()],
        done: "Full suite: 214 passing.",
      },
      {
        p: "Nice. Add Retry-After and X-RateLimit-Remaining headers, one test each, then commit.",
        tools: [edit("src/ratelimit/middleware.ts"), edit("src/routes/v1.ratelimit.test.ts"), test(), commit("ratelimit: wire into /v1 with headers")],
      },
      {
        p: "Load test output (k6, 200 vus, 60s):\n\n  http_req_duration p(99)=44.1ms (was 41.3ms)\n  http_reqs 182,344  429s 0\n\n+3ms p99 is fine. Add a note to AGENTS.md on the Redis key format `rl:{keyId}:{window}` so the next session knows it.",
        tools: [edit("AGENTS.md"), commit("docs: rate limit key format")],
      },
      {
        p: "Edge case: keys with no plan tier. Default to free and log a warning once per key. Test it.",
        tools: [edit("src/ratelimit/limits.ts"), edit("src/ratelimit/bucket.test.ts"), test(), commit("ratelimit: default missing tier to free")],
      },
      { p: "Run the full suite and lint.", tools: [test(), sh("bun run lint")], done: "216 passing, lint clean." },
      {
        p: "Perfect — ship it. Push and open the PR with a short design summary and the load test numbers.",
        tools: [sh("git push -u origin ratelimit"), sh("gh pr create --fill")],
        done: "PR #482 opened.",
      },
    ],
  },

  flowing: {
    project: "billing-dashboard",
    title: "CSV export for invoices",
    exs: [
      {
        p: "Add a CSV export button to the invoices table. It should export the rows that match the current filters, not just the visible page. Look at src/components/InvoiceTable.tsx and the /api/invoices handler.",
        tools: [read("src/components/InvoiceTable.tsx"), read("src/api/invoices.ts")],
      },
      {
        p: "Do it server-side: add GET /api/invoices/export that takes the same filter params and streams CSV.",
        tools: [edit("src/api/invoices.ts"), write("src/api/invoices.export.test.ts"), test()],
      },
      {
        p: "no, keep the amounts in cents in the CSV — finance imports it into NetSuite and it expects integers.",
        tools: [edit("src/api/invoices.ts"), test()],
      },
      { p: "Good. Now the button, next to the filter bar.", tools: [edit("src/components/InvoiceTable.tsx"), edit("src/components/FilterBar.tsx")] },
      { p: "Commit that.", tools: [commit("invoices: CSV export")], dur: 0.5 },
      {
        p: "Add the customer email column after customer name, and quote fields that contain commas. Test with a name like \"Acme, Inc.\"",
        tools: [edit("src/api/invoices.ts"), edit("src/api/invoices.export.test.ts"), test()],
      },
      { p: "Great. Commit.", tools: [commit("invoices: email column, CSV quoting")], dur: 0.5 },
      {
        p: "Large exports: what happens at 50k rows? Check memory with the seed script.",
        tools: [sh("bun run seed --invoices 50000"), sh("bun run scripts/export-bench.ts")],
        done: "Peak RSS 92MB, streams fine.",
      },
    ],
  },

  steady: {
    project: "acme-api",
    title: "How webhook retries work",
    exs: [
      { p: "How do webhook retries work in this codebase? Start from src/webhooks/.", tools: [read("src/webhooks/dispatch.ts"), read("src/webhooks/queue.ts"), grep("retry")] },
      { p: "What's the backoff schedule exactly? And is there a max attempts?", tools: [read("src/webhooks/backoff.ts")] },
      { p: "Where do failed deliveries end up after the last retry?", tools: [grep("dead_letter"), read("src/webhooks/dlq.ts")] },
      { p: "Is there anything that replays the dead letter queue, or is that manual?", tools: [grep("replay"), read("scripts/replay-dlq.ts")] },
      { p: "OK. Do we sign the payloads? A customer asked how to verify them.", tools: [grep("signature"), read("src/webhooks/sign.ts")] },
      { p: "Draft a short docs section on verifying signatures, with a Node example. Put it in docs/webhooks.md.", tools: [read("docs/webhooks.md"), edit("docs/webhooks.md")] },
      { p: "The example should use timingSafeEqual, not ===.", tools: [edit("docs/webhooks.md")] },
    ],
  },

  grinding: {
    project: "acme-api",
    title: "Flaky checkout e2e test",
    exs: [
      {
        p: "The checkout e2e test is flaky in CI, about 1 in 5 runs. Can you fix it?",
        tools: [read("e2e/checkout.spec.ts"), sh("bunx playwright test e2e/checkout.spec.ts")],
        done: "Passes locally. I'll add an explicit wait for the payment iframe.",
      },
      { p: "ok try that", tools: [edit("e2e/checkout.spec.ts"), sh("bunx playwright test e2e/checkout.spec.ts --repeat-each=10", "2 failed, 8 passed\n  TimeoutError: locator.click: Timeout 5000ms exceeded. waiting for getByRole('button', { name: 'Pay' })")] },
      {
        p: "still failing. same timeout on the Pay button.",
        tools: [edit("e2e/checkout.spec.ts"), sh("bunx playwright test e2e/checkout.spec.ts --repeat-each=10", "1 failed, 9 passed\n  TimeoutError: locator.click: Timeout 5000ms exceeded.")],
      },
      {
        p: "Don't just bump timeouts. Look at what the Pay button is waiting on.",
        tools: [read("src/web/checkout/PayButton.tsx"), grep("useStripe"), read("src/web/checkout/usePaymentIntent.ts")],
        say: "The button stays disabled until the PaymentIntent fetch resolves. In CI the stub server is cold on the first request.",
      },
      { p: "That makes sense. Warm the stub server in globalSetup.", tools: [edit("e2e/global-setup.ts"), sh("bunx playwright test e2e/checkout.spec.ts --repeat-each=20")], done: "20/20 passed locally." },
      { p: "Push it and let's see CI.", tools: [commit("e2e: warm payment stub in globalSetup"), sh("git push")], dur: 6 },
      {
        p: "CI failed again:\n\n  checkout.spec.ts:41 › pays with saved card\n  Error: expect(locator).toHaveText('Order confirmed') received 'Processing…'",
        tools: [read("e2e/checkout.spec.ts"), sh("gh run view --log-failed", "exit code 1: run 88123 still in progress")],
      },
      { p: "you didn't wait for the confirmation. That's a different failure than before.", tools: [edit("e2e/checkout.spec.ts"), sh("bunx playwright test e2e/checkout.spec.ts --repeat-each=20")] },
      { p: "push", tools: [commit("e2e: wait for order confirmation"), sh("git push")], dur: 8 },
      {
        p: "CI red again, now it's the saved-card test timing out on the Pay button again. why is this still happening",
        tools: [sh("gh run view --log-failed", "TimeoutError: locator.click: Timeout 5000ms exceeded."), read("e2e/global-setup.ts")],
      },
    ],
  },

  take_a_break: {
    project: "acme-api",
    title: "OAuth refresh token 401s",
    exs: [
      { p: "Users are getting logged out randomly. Fix the refresh token flow.", tools: [read("src/auth/refresh.ts"), grep("refresh_token")], gap: 2 },
      { p: "try it", tools: [edit("src/auth/refresh.ts"), test("bun test src/auth", "1 failed: refresh › rotates token\n  expected 200, received 401")], gap: 4 },
      { p: "still getting 401 on refresh", tools: [edit("src/auth/refresh.ts"), test("bun test src/auth", "1 failed: refresh › rotates token\n  expected 200, received 401")], gap: 6 },
      { p: "no that's not it. the refresh still returns 401", tools: [edit("src/auth/tokens.ts"), edit("src/auth/refresh.ts")], interrupt: true, gap: 5 },
      { p: "why did you change tokens.ts? revert that", tools: [sh("git checkout src/auth/tokens.ts")], gap: 1 },
      { p: "the refresh endpoint still returns 401 after the access token expires", tools: [read("src/auth/refresh.ts"), edit("src/auth/refresh.ts"), test("bun test src/auth", "1 failed: refresh › rotates token\n  expected 200, received 401")], gap: 9 },
      { p: "same error. the refresh endpoint still returns a 401 after the access token expires", tools: [edit("src/auth/session.ts")], gap: 12 },
      { p: "stop editing session.ts", tools: [{ name: "Edit", input: { file_path: "migrations/0042_tokens.sql" }, reject: true }], gap: 3 },
      { p: "wait why are you touching the migration", tools: [], gap: 1 },
      { p: "ok just add logging so we can see what's happening", tools: [edit("src/auth/refresh.ts"), sh("bun run dev", "Error: listen EADDRINUSE: address already in use :::3000")], gap: 14 },
      { p: "kill whatever is on 3000 and try again", tools: [sh("lsof -ti:3000 | xargs kill"), sh("bun run dev & sleep 2 && curl -s -X POST localhost:3000/oauth/token -d grant_type=refresh_token", "401 {\"error\":\"invalid_grant\"}")], gap: 6 },
      { p: "invalid_grant?? the token is right there", tools: [{ name: "Bash", input: { command: "psql $DATABASE_URL -c 'delete from refresh_tokens'" }, reject: true }], gap: 15 },
      { p: "no don't delete the tokens. why would you do that", tools: [], gap: 1 },
      { p: "the refresh endpoint keeps returning 401 invalid_grant after the access token expires, fix it", tools: [edit("src/auth/refresh.ts"), test("bun test src/auth", "1 failed: refresh › rotates token\n  expected 200, received 401")], gap: 13 },
      { p: "still failing", tools: [edit("src/auth/refresh.ts")], interrupt: true, gap: 8 },
      { p: "ugh. same 401 invalid_grant on refresh after expiry. try again", tools: [edit("src/auth/refresh.ts"), test("bun test src/auth", "1 failed: refresh › rotates token\n  expected 200, received 401")], gap: 15 },
    ],
  },
};

// ---------- synthetic history ----------

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TASKS: Record<string, { title: string; goal: string; done: string; file: string }[]> = {
  "acme-api": [
    { title: "Pagination for /v1/projects", goal: "cursor pagination on GET /v1/projects", done: "`bun test src/routes` passes and the response has next_cursor", file: "src/routes/v1.ts" },
    { title: "API key rotation endpoint", goal: "POST /v1/keys/:id/rotate", done: "the old key works for 24h and the new key works now, with a test for both", file: "src/routes/keys.ts" },
    { title: "Audit log for admin actions", goal: "an audit_log table and a write on every admin mutation", done: "migration applies and admin.test.ts covers three actions", file: "src/admin/index.ts" },
    { title: "Fix N+1 in project listing", goal: "remove the N+1 query in project listing", done: "the query count in the test drops from 51 to 2", file: "src/db/projects.ts" },
    { title: "Webhook signing", goal: "HMAC-sign webhook payloads", done: "the signature header is present and verify() round-trips in a test", file: "src/webhooks/sign.ts" },
    { title: "Upgrade to Postgres 17", goal: "bump the docker image and driver for Postgres 17", done: "migrations and the full suite pass on 17", file: "docker-compose.yml" },
    { title: "Debug memory leak in worker", goal: "find the memory leak in the queue worker", done: "RSS stays flat over a 10 min soak", file: "src/worker/index.ts" },
  ],
  "billing-dashboard": [
    { title: "Dark mode", goal: "dark mode for the dashboard via CSS variables", done: "every page passes the contrast check in both themes", file: "src/styles/tokens.css" },
    { title: "Invoice PDF preview", goal: "inline PDF preview for invoices", done: "the preview loads in under 500ms for the seed invoices", file: "src/components/InvoiceView.tsx" },
    { title: "Stripe webhook reconciliation", goal: "reconcile Stripe payment events with invoices", done: "the reconciliation test with 3 fixture events passes", file: "src/api/stripe.ts" },
    { title: "Chart of MRR", goal: "an MRR chart on the overview page", done: "the numbers match the finance export for October", file: "src/pages/Overview.tsx" },
  ],
  "ios-app": [
    { title: "Offline cache for feed", goal: "cache the feed for offline use", done: "the feed loads in airplane mode in the simulator", file: "App/Feed/FeedStore.swift" },
    { title: "Push notification deep links", goal: "deep links from push notifications", done: "tapping a test push opens the right project", file: "App/Notifications/Router.swift" },
    { title: "Fix crash on iPad rotation", goal: "fix the crash on iPad rotation", done: "rotation 20 times in the simulator with no crash", file: "App/Projects/ProjectGrid.swift" },
  ],
  infra: [
    { title: "Terraform for staging", goal: "Terraform for the staging environment", done: "`terraform plan` is clean against staging", file: "infra/staging/main.tf" },
    { title: "CI cache for bun install", goal: "cache bun install in CI", done: "CI install step under 10s on a warm cache", file: ".github/workflows/ci.yml" },
    { title: "Alert on 5xx rate", goal: "an alert when 5xx rate exceeds 1% for 5 minutes", done: "the alert fires in the staging drill", file: "infra/alerts.tf" },
  ],
};

function historySession(r: () => number, project: string, task: (typeof TASKS)[string][number], quality: number): Ex[] {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const good = quality > 0.55;
  const exs: Ex[] = [];
  exs.push({
    p: good || r() < 0.3
      ? `Goal: ${task.goal}. Done = ${task.done}. Read ${task.file} first and tell me the plan before editing.`
      : pick([`can you do ${task.goal}`, `${task.goal}`, `look at ${task.file}, need ${task.goal}`]),
    tools: [read(task.file), grep(task.file.split("/").pop()!.split(".")[0]!)],
  });
  const n = 6 + Math.floor(r() * 14);
  let lastBad = "";
  for (let i = 1; i < n; i++) {
    const x = r();
    const pBad = 0.7 - quality * 0.65;
    if (x < pBad * 0.45) {
      // correction / retry
      const msg = lastBad && r() < 0.5 ? lastBad : pick([
        `no, that's not what I meant. ${task.goal} should not change ${task.file.split("/").pop()}`,
        `still failing, same error`,
        `that broke the build`,
        `why did you change the tests?`,
        `you didn't run the tests`,
        `still not working after that change to ${task.file}`,
      ]);
      lastBad = msg;
      exs.push({ p: msg, tools: [edit(task.file), test("bun test", r() < 0.6 ? "1 failed" : undefined)], interrupt: r() < 0.25, gap: 2 + r() * 6 });
    } else if (x < pBad * 0.7) {
      exs.push({ p: pick(["try again", "hmm, check the logs", "ok", "what now"]), tools: [sh("bun run dev", r() < 0.5 ? "Error: exit 1" : undefined), { name: "Edit", input: { file_path: task.file }, reject: r() < 0.4 }], gap: 3 + r() * 8 });
    } else if (x < pBad) {
      exs.push({ p: pick(["what does this function do?", `where is ${task.goal} configured?`, "explain the error"]), tools: [read(task.file)], gap: 2 + r() * 4 });
    } else if (x < pBad + (1 - pBad) * 0.35) {
      exs.push({ p: pick(["Green. Commit it.", "Commit that.", "Tests pass, commit."]), tools: [test(), commit(task.title.toLowerCase())], gap: 1 + r() * 2 });
    } else if (x < pBad + (1 - pBad) * 0.5) {
      exs.push({ p: pick(["perfect, thanks", "nice. next step", "great, that works", "exactly right"]), tools: [edit(task.file), test()], gap: 1 + r() * 3 });
    } else {
      exs.push({
        p: pick([
          `Next: add a test for the empty case in ${task.file}.`,
          `Now handle the error path and add a test for it.`,
          `Refactor the helper into its own module, no behavior change. Run the tests after.`,
          `Add a short note to AGENTS.md about how this works.`,
        ]),
        tools: [edit(task.file), write(task.file.replace(/(\.\w+)$/, ".test$1")), test()],
        gap: 1 + r() * 4,
      });
    }
  }
  return exs;
}

// ---------- main ----------

rmSync(DEMO_DIR, { recursive: true, force: true });
const now = Date.now();
const r = rng(7);
let count = 0;
for (const [project, tasks] of Object.entries(TASKS)) {
  for (let rep = 0; rep < 2; rep++) {
    for (const task of tasks) {
      if (rep === 1 && r() < 0.5) continue;
      const quality = Math.pow(r(), 1.4);
      const exs = historySession(r, project, task, quality);
      const daysAgo = 2 + Math.floor(r() * 55);
      const hour = 8 + Math.floor(r() * 15); // 8:00 to 22:00
      const d = new Date(now - daysAgo * 24 * 60 * MIN);
      d.setHours(hour, Math.floor(r() * 60), 0, 0);
      const id = `hist-${String(++count).padStart(3, "0")}-${Math.floor(r() * 1e8).toString(16)}`;
      const dir = projDir(join(DEMO_DIR, "history"), project);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.jsonl`), build(id, task.title, `/Users/demo/code/${project}`, d.getTime(), exs));
    }
  }
}

for (const [name, sc] of Object.entries(SCENARIOS)) {
  const dir = projDir(join(DEMO_DIR, "live"), sc.project);
  mkdirSync(dir, { recursive: true });
  const id = `demo-${name}`;
  const start = now - span(sc.exs) - 1 * MIN;
  writeFileSync(join(dir, `${id}.jsonl`), build(id, sc.title, `/Users/demo/code/${sc.project}`, start, sc.exs));
}

console.log(`${count} history sessions and ${Object.keys(SCENARIOS).length} live scenarios in ${DEMO_DIR}`);
