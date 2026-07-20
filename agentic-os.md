# AgentOS — Full Build Workflow (with Advanced Backend Stack)

Step-by-step execution plan combining the original 6-phase roadmap with Redis,
Temporal, Kafka/event-driven patterns, resilience engineering, and production
observability. Each step lists **what to build**, **why**, **how**, and a
**checkpoint** you should be able to demo before moving on.

Stack added on top of the original design:
`Redis` (cache/queue/pubsub/locks/rate-limit) · `Temporal.io` (durable workflows)
· `Kafka/Redpanda` (event pipeline) · `pgvector` (Postgres vector option) ·
`Debezium` (CDC) · `opossum` (circuit breaker) · `Prometheus + Grafana`
(metrics) · `JWT/OAuth2` (auth) · `Kubernetes + Terraform` (deploy path) ·
`S3/MinIO` (uploads & attachments) · `Web Push/VAPID` (notifications) ·
`Postgres RLS` (multi-tenancy)

**Feature set added on top of the core loop:** file upload & multimodal input,
conversation management (history/search/branching), an eval pipeline for the
agent loop itself, push notifications, a usage/cost dashboard, and
multi-tenant team workspaces. These are new Steps 1.5, 1.6, 1.7, 6.5, 7.5, and
8.5 below — each slots in right after the step it depends on, so the numbering
of the original steps doesn't change.

**Frontend decision (locked in):** browser UI is a **separate Next.js app**
(`apps/web`) — it does not absorb the Express API. Next.js talks to the
existing Express backend (`apps/api`) over plain HTTP for request/response
calls, and over **Server-Sent Events** (native `EventSource`, not WebSockets)
for live chat/agent/trace streaming. Because SSE is one-way (server → client),
sending a message or a cancellation goes out as its own regular HTTP POST, and
the reply streams back on the open SSE connection for that session — there's
no bidirectional socket to manage. Redis pub/sub is what lets multiple Express
instances share that SSE fan-out once you're behind a load balancer (Step 7
covers this), since the instance that handles a given POST isn't necessarily
the instance holding that session's open stream. This keeps the backend
deployable/testable independent of any frontend framework choice, and matches
the K8s deploy path in Step 10 (two Deployments, two Services).

---

## Step 0 — Environment & Repo Setup
**Time:** 1–2 days

- [ ] Init monorepo (already scaffolded): `apps/api` (Express backend), `apps/web` (Next.js frontend), `services/`, `mcp-servers/`, `infra/`
- [ ] `infra/docker-compose.yml` with: Postgres, Redis, Qdrant, Neo4j (add Kafka/Temporal later — don't front-load)
- [ ] `.env.example` for all secrets (ANTHROPIC_API_KEY, TAVILY_API_KEY, REDIS_URL, DATABASE_URL, etc.) **plus** frontend/CORS vars: `FRONTEND_URL` (Express CORS allow-list), `NEXT_PUBLIC_API_URL` — no separate WS URL needed, since SSE rides on the same HTTP origin as the REST API
- [ ] Basic CI (GitHub Actions): lint + typecheck on push, run for both `apps/api` and `apps/web`
- [ ] Turborepo or plain `pnpm` workspaces + `concurrently` so `pnpm dev` boots API and web together locally

```yaml
# infra/docker-compose.yml (v1 — core services only)
services:
  postgres:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: devpass }
    ports: ["5432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  qdrant:
    image: qdrant/qdrant
    ports: ["6333:6333"]
  neo4j:
    image: neo4j:5
    environment: { NEO4J_AUTH: neo4j/devpass }
    ports: ["7474:7474", "7687:7687"]
```

**Checkpoint:** `docker compose up` brings up all 4 services healthy.

---

## Step 0.5 — Next.js Frontend Shell (new)
**Time:** 1–2 days · run in parallel with Step 0, before Step 1's chat UI needs it

- [ ] `apps/web`: Next.js (App Router) + TypeScript + Tailwind
- [ ] Route skeleton: `/chat`, `/jobs` (Temporal/cron, Step 6), `/traces` (observability, Step 7), `/settings`
- [ ] `packages/shared-types`: one TypeScript (Zod-validated) source of truth for SSE event shapes (the `history` / `token` / `done` / `trace` payloads), imported by **both** `apps/api` and `apps/web` — this is what stops the client and server payloads from drifting apart over time
- [ ] Basic API client (`lib/api.ts`) using `NEXT_PUBLIC_API_URL` for REST calls, and a small `lib/stream.ts` wrapper around `EventSource` for opening a session's SSE stream

**Checkpoint:** `pnpm dev` boots both apps; `localhost:3000/chat` loads a placeholder page that successfully calls the Express health-check endpoint.

---

## Step 1 — Core Agent Loop (Phase 1)
**Time:** 3–5 days · *(scaffold already started)*

- [ ] LangGraph orchestrator: `agent` node + `tools` node + conditional routing (done)
- [ ] One MCP tool (web search) wired through Tool Router (done)
- [ ] **Express API `/chat` endpoint streams over SSE** (`text/event-stream`) — the client opens a long-lived `GET /chat/:sessionId/stream` to receive tokens, and sends follow-ups/cancellations as separate `POST /chat/:sessionId/message` and `POST /chat/:sessionId/cancel` requests, since SSE itself can't carry client→server traffic
- [ ] **Add Redis session store**: move conversation buffer from in-memory to Redis Hash with TTL, keyed by `session:{id}` — this also backs SSE reconnection: on reconnect the client resends its `sessionId` (and the browser's native `EventSource` retry also sends a `Last-Event-ID` header), so the server can rehydrate conversation state from Redis — and even replay events the client missed — instead of a browser refresh just losing history
- [ ] **Add Redis rate limiting**: sliding-window limiter (sorted set + Lua script) on stream-open and POST-message events per user/IP
- [ ] `apps/web` chat UI: `/chat` page + a `useAgentStream()` hook — opens an `EventSource` for incoming tokens, POSTs outgoing messages separately, and gets reconnection close to free: native `EventSource` retries the connection automatically on drop (no manual backoff loop to write), and `Last-Event-ID` handles replay

```ts
// Express: SSE stream handler (replaces the ws upgrade handler)
import { Router } from "express";
const router = Router();

// server → client: long-lived stream, one per session
router.get("/chat/:sessionId/stream", async (req, res) => {
  const { sessionId } = req.params;
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const raw = await redis.hGet(`session:${sessionId}`, "messages");
  send(res, "history", { messages: raw ? JSON.parse(raw) : [] });

  registerStream(sessionId, res); // in-memory map here; Step 7 swaps this for Redis pub/sub across replicas
  req.on("close", () => unregisterStream(sessionId, res));
});

// client → server: a plain request, not the SSE connection
router.post("/chat/:sessionId/message", async (req, res) => {
  const { sessionId } = req.params;
  const { content } = req.body;
  res.sendStatus(202); // ack immediately; the reply streams over the open SSE connection

  // stream tokens back as event: token, then event: done
  // append to Redis hash + refresh TTL when the turn completes
  streamAgentReply(sessionId, content);
});

function send(res, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
```

```ts
// apps/web: EventSource-based stream hook sketch
function useAgentStream(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const es = new EventSource(`${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/stream`);
    es.addEventListener("history", (e) => setMessages(JSON.parse(e.data).messages));
    es.addEventListener("token", (e) => appendToken(JSON.parse(e.data)));
    es.addEventListener("done", () => markTurnComplete());
    // no manual reconnect loop — EventSource retries the connection itself on drop
    return () => es.close();
  }, [sessionId]);

  const sendMessage = (content: string) =>
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

  return { messages, sendMessage };
}
```

**Checkpoint:** Chat works end-to-end over SSE in the Next.js UI, survives an Express restart (session rehydrated from Redis) *and* a browser refresh (`EventSource` reconnects automatically), and rejects messages over the rate limit.

---

## Step 1.5 — File Upload, Attachments & Multimodal Input (new)
**Time:** 1–2 weeks part-time

- [ ] Object storage: add a `minio` service to docker-compose locally (S3-compatible; swap for real S3 in prod)
- [ ] Upload flow uses **presigned URLs**, not a proxy through Express: client asks Express for a signed PUT URL, uploads the file straight to storage, then POSTs the resulting key back — large files never round-trip through your API process
- [ ] Routing by type: images are attached to the next turn as an image block sent straight to the model (vision); PDFs/docs are enqueued into the **same ingest pipeline as Step 2** (chunk → embed → Qdrant), scoped to that session/user, so the agent can retrieve from something just uploaded mid-conversation
- [ ] Voice input: browser `MediaRecorder` captures audio → uploaded through the same flow → transcribed server-side → the transcript is submitted as a normal chat message (no separate "voice" code path in the orchestrator)
- [ ] Size limits + content-type allowlist enforced at the presign step, before anything is stored or sent to a model
- [ ] Reuse the Step 1 Redis sliding-window limiter on uploads per user/IP
- [ ] **Frontend surface:** drag-and-drop + paste-to-upload in the chat composer, inline image thumbnails/file chips in the message list, a mic button with a recording indicator; upload progress comes from the presigned PUT itself, not the SSE stream — SSE is reserved for the agent's reply

```ts
// Express: presigned upload, then a completion callback
router.post("/chat/:sessionId/uploads/presign", async (req, res) => {
  const { filename, contentType } = req.body;
  const key = `${req.params.sessionId}/${crypto.randomUUID()}-${filename}`;
  const url = await getPresignedPutUrl(key, contentType); // S3/MinIO SDK
  res.json({ url, key });
});

router.post("/chat/:sessionId/uploads/:key/complete", async (req, res) => {
  const { sessionId, key } = req.params;
  const file = await getObjectMetadata(key);

  if (file.contentType.startsWith("image/")) {
    await attachImageToSession(sessionId, key); // sent as an image block on the next turn
  } else {
    await enqueueIngestJob({ sessionId, key }); // Step 2's chunk/embed/store pipeline, session-scoped
  }
  res.sendStatus(202);
});
```

**Checkpoint:** Upload an image mid-conversation and ask the agent about it (vision works); upload a PDF and ask something only answerable from it (session-scoped RAG works); record a voice note and see it land as a transcribed message — none of it blocks or drops the SSE stream already open for that session.

---

## Step 1.6 — Conversation Management, Message Actions & Sharing (new)
**Time:** 1–2 weeks part-time

- [ ] `conversations` Postgres table (`id`, `user_id`, `title`, `created_at`, `updated_at`, `archived`) — the Redis buffer from Step 1 stays the *hot* working copy for the active turn; on each turn's `done` event, sync it to Postgres so history survives past the Redis TTL
- [ ] Messages modeled as a **tree, not a flat log**: every message has a `parent_message_id`. Editing a past user message or regenerating a reply doesn't mutate history — it inserts a new leaf under the same parent, so nothing is ever lost
- [ ] Sidebar UI: conversation list grouped by recency, search (Postgres `ILIKE`/full-text is plenty at this scale), rename, archive/delete, pin
- [ ] Message actions in the UI: edit-and-resend (forks a branch), regenerate (same idea), and a simple branch switcher wherever a message has more than one child
- [ ] Export: render a conversation to Markdown directly from the structured messages, and to PDF via the same PDF pipeline you'd use elsewhere (headless render of that Markdown/HTML)
- [ ] Sharing: a `share_token` column on `conversations`; a public read-only `/share/:token` route in `apps/web`, served by an endpoint that requires no auth and is scoped strictly to that one token

```sql
-- messages as a tree, not a flat log
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  parent_message_id UUID REFERENCES messages(id),
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Checkpoint:** Rename and search past conversations; edit an earlier message and watch it fork into a new branch without losing the original; regenerate a reply and switch between versions; export a conversation to PDF; open a `/share/:token` link in a private window and see it with no login.

---

## Step 1.7 — Loop Engineering & Eval Pipeline (new)
**Time:** 1–2 weeks part-time

Placed here deliberately: everything from Step 2 onward (RAG, resilience,
memory, more tools) changes how the core loop behaves, and from this point on
you want a way to catch regressions instead of eyeballing transcripts.

- [ ] Fixture set: 30–100 recorded `(prompt, expected-behavior)` cases checked into the repo as JSON/YAML — tool selection, refusals, multi-step tool chains, and every failure mode you've already hit, not just happy-path cases
- [ ] Eval runner (`services/evals`): replays each fixture against the current orchestrator, scores the result (exact-match where possible, LLM-as-judge with a rubric where not), and produces a pass/fail + diff report
- [ ] Wire it into CI on any PR touching the orchestrator, tool router, or system prompt; surface regressions prominently (full merge-blocking can come once the suite is trustworthy)
- [ ] Version-tag every system-prompt/routing change, and log that version alongside the OTel spans from Step 7 — so a regression seen live can be traced straight back to the prompt version that shipped it
- [ ] A small CLI to run one fixture interactively while iterating, instead of waiting on the full suite each time

```ts
// services/evals: minimal runner sketch
for (const fixture of loadFixtures()) {
  const result = await runOrchestrator(fixture.input, { promptVersion: CURRENT_VERSION });
  const verdict = fixture.expected.type === "exact"
    ? deepEqual(result, fixture.expected.value)
    : await judgeWithRubric(result, fixture.expected.rubric); // LLM-as-judge fallback
  report.push({ fixture: fixture.id, pass: verdict });
}
```

**Checkpoint:** Deliberately break one known case with a system-prompt or routing tweak — the eval suite catches it in CI before it ever reaches a real conversation.

---

## Step 2 — Advanced RAG (Phase 2)
**Time:** 3–4 weeks part-time

- [ ] Ingest pipeline: chunk documents (parent-document strategy), embed, store in Qdrant
- [ ] Hybrid retrieval: BM25 (e.g. via `elasticlunr` or Postgres full-text) + Qdrant dense search, fused with RRF
- [ ] Cross-encoder reranker (e.g. `bge-reranker` via a small Python microservice, called over HTTP)
- [ ] Self-RAG critic loop: LLM judges retrieved chunks, re-retrieves once if irrelevant
- [ ] **Add Redis semantic cache**: hash query embedding → cache key, store `{query, answer}` with TTL; check cache before running full pipeline
- [ ] *(Optional)* Evaluate `pgvector` on Postgres as an alternative backend — implement both, benchmark query latency, document the tradeoff (great interview talking point)

```ts
// Semantic cache check (pseudo)
const cacheKey = `ragcache:${hashEmbedding(queryEmbedding)}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
// ...else run full pipeline, then:
await redis.set(cacheKey, JSON.stringify(answer), { EX: 1800 });
```

**Checkpoint:** Ask the same/similar question twice — second response is near-instant (cache hit). Multi-hop question gets a correct answer via retry loop.

---

## Step 3 — Resilience Layer (new — insert before Phase 3)
**Time:** 3–5 days

Do this now, before you have many tool calls, so every tool call added afterward
inherits it for free.

- [ ] Wrap every external call (LLM API, MCP tool call, Composio call) in a **circuit breaker** (`opossum` in Node)
- [ ] Add **exponential backoff + jitter** retry wrapper around all HTTP calls to tools
- [ ] Add **bulkhead limits**: max concurrent tool calls per session (prevents one runaway agent from starving others)

```ts
import CircuitBreaker from "opossum";
const breaker = new CircuitBreaker(callMcpTool, {
  timeout: 8000,
  errorThresholdPercentage: 50,
  resetTimeout: 15000,
});
breaker.fallback(() => ({ error: "tool temporarily unavailable" }));
```

**Checkpoint:** Kill the web-search MCP server mid-conversation — orchestrator degrades gracefully instead of hanging/crashing, and recovers automatically once the tool comes back.

---

## Step 4 — Agentic OS Layer (Phase 3)
**Time:** 3–5 weeks part-time

- [ ] Docker-per-session sandbox manager (spin up/tear down containers on session start/end)
- [ ] `mcp-code-exec` tool: sandboxed Python/shell execution
- [ ] `mcp-filesystem` tool: scoped read/write within session workspace, tiered permissions
- [ ] `mcp-browser` tool: Playwright container + navigate/click/extract actions
- [ ] Permission tiers enforced at Tool Router level (`read-only` / `write-workspace` / `execute-shell` / `network`)
- [ ] All new tools automatically get circuit breaker + retry from Step 3
- [ ] **Frontend surface:** `apps/web` renders a live workspace panel — file tree + inline stdout/stderr stream — reading the same per-session SSE event stream as the chat pane, so code-exec output appears next to the conversation instead of only in server logs

**Checkpoint:** Agent can be asked to "write and run a Python script that fetches X and saves results to a file" and does so safely inside an isolated container, and you can watch the output land in the browser as it happens.

---

## Step 5 — Memory Layer (Phase 4)
**Time:** 2–3 weeks part-time

- [ ] Episodic memory table in Postgres (task → action → outcome log)
- [ ] Graph memory in Neo4j for entity relationships / multi-hop recall
- [ ] User profile/preferences table
- [ ] *(Advanced, optional)* **Debezium CDC**: stream Postgres row changes into Kafka so the memory service updates its vector/graph indexes in near-real-time instead of via manual sync jobs — a strong "I understand event-driven data sync" resume line
- [ ] **Frontend surface:** simple `/settings` profile/preferences page in `apps/web`, backed by a small read/write REST endpoint (not the SSE stream) on the Express side

**Checkpoint:** Agent references a fact from 3 sessions ago without it being in the current context window (proves long-term memory works, not just conversation history).

---

## Step 6 — Durable Autonomy: Cron + Temporal (Phase 5, upgraded)
**Time:** 3–4 weeks part-time

This is where Temporal earns its place — cron jobs that must survive crashes,
retries, and long waits are exactly Temporal's use case, and it looks much
stronger on a resume than "I used `node-cron`."

- [ ] Stand up Temporal server (`docker-compose` service) + Temporal TypeScript SDK
- [ ] Define a **Workflow**: `runScheduledAgentTask(taskSpec)` — durable, resumable, automatically retried on failure
- [ ] Define **Activities**: `callOrchestrator`, `notifyUser`, `requestApproval` — the actual side-effecting steps Temporal calls on your behalf
- [ ] `cron_jobs` Postgres table (schema from earlier doc) stores job definitions; a lightweight scheduler service starts a Temporal Workflow on each trigger (cron/interval/one-off/event)
- [ ] **Redis** here backs the job queue for *lightweight* immediate tasks (BullMQ), while **Temporal** handles the *durable, long-running, or approval-gated* jobs — use both deliberately and be able to explain why in an interview
- [ ] Approval workflow: Temporal Workflow pauses on a Signal, waiting for human approval before continuing (natural fit for Temporal's model)
- [ ] **Frontend surface:** `/jobs` page in `apps/web` lists scheduled jobs and their live status (pushed over the same SSE channel as chat/trace events); an "Approve" / "Reject" button POSTs to Express, which sends the Temporal Signal that unblocks the waiting workflow

```ts
// Temporal workflow sketch
export async function runScheduledAgentTask(taskSpec: TaskSpec) {
  if (taskSpec.requiresApproval) {
    await condition(() => approvalReceived); // waits, durably, for a signal
  }
  const result = await callOrchestrator(taskSpec); // Activity, auto-retried
  await notifyUser(result);
  return result;
}
```

**Checkpoint:** Schedule a job, kill the worker process mid-run, restart it — the job resumes correctly instead of silently failing (this is the whole point of Temporal, and worth actually demoing).

---

## Step 6.5 — Notifications (Web Push) (new)
**Time:** 3–5 days

- [ ] Browser requests push permission; `apps/web` registers a service worker and subscribes via the Push API; the subscription object is sent to Express and stored in a `push_subscriptions` table keyed by user
- [ ] Generate VAPID keys once, store them in the same secrets store as Step 8
- [ ] The `notifyUser` Activity stubbed in Step 6 now actually sends a push — "your scheduled job finished," "a job is waiting on your approval" — instead of just logging
- [ ] Wire the Step 7 alerting consumer (Slack webhook) to optionally push the same event to a subscribed user, so ops alerts and user-facing notifications share one trigger path
- [ ] Push is additive, not the only delivery path: if permission was never granted, the same event still lands in the in-app SSE stream, so nothing is silently lost

```ts
// Temporal Activity: notifyUser now actually notifies
export async function notifyUser(userId: string, message: string) {
  const subs = await getPushSubscriptions(userId);
  await Promise.allSettled(subs.map((sub) => webpush.sendNotification(sub, JSON.stringify({ message }))));
}
```

**Checkpoint:** Close the browser tab, trigger a Temporal approval-gated job from another device, and get a native OS push notification; approving from the notification (or from `/jobs` once you reopen the tab) unblocks the waiting workflow.

---

## Step 7 — Event-Driven Observability Pipeline (Phase 6, upgraded)
**Time:** 2–3 weeks part-time

- [ ] Instrument orchestrator/tools/scheduler with **OpenTelemetry** spans (`run_id`, `step_type`, `latency`, `tokens`, `cost`)
- [ ] Stand up **Kafka or Redpanda**; publish every OTel span as an event instead of writing directly to Postgres
- [ ] Consumers: (a) a Postgres/ClickHouse sink for the trace-tree UI, (b) a **Prometheus** metrics consumer (span counts, latencies, error rates), (c) an alerting consumer (e.g. Slack webhook on repeated tool failures)
- [ ] **Grafana** dashboard on top of Prometheus: request rate, p95 latency per tool, token spend over time, circuit breaker trip count
- [ ] **Redis pub/sub feeds the SSE layer**: each Express instance publishes span events to a per-session Redis channel; every instance subscribes and forwards matching events, as SSE chunks, to whichever locally-held streams care about that session. This is the piece that lets you run more than one Express replica behind a load balancer without a client ever missing a live update — without it, a client whose stream is held open by instance A never sees events emitted by instance B
- [ ] **Frontend surface:** `/traces` page in `apps/web` — a trace-tree component subscribed to the same SSE connection as chat, rendering spans (`run_id`, `step_type`, `latency`, `tokens`, `cost`) as they arrive; embed the Grafana dashboard via `<iframe>` (Grafana's public/embed sharing) rather than reimplementing charts in React

```ts
// Express: Redis pub/sub → SSE fan-out sketch
await redisSub.subscribe(`trace:${sessionId}`, (message) => {
  for (const res of sseStreamsForSession(sessionId)) {
    res.write(`event: trace\ndata: ${message}\n\n`); // message is already the shared-types TraceEvent JSON
  }
});
// elsewhere, any instance handling a span does:
await redisPub.publish(`trace:${sessionId}`, JSON.stringify(traceEvent));
```

**Checkpoint:** Open Grafana while running a multi-step agent task and watch tool-call latency and token cost update live; the trace tree in `apps/web` shows every step with full input/output over SSE, and still works correctly if you scale the Express API to 2+ replicas.

---

## Step 7.5 — Usage & Cost Dashboard (new)
**Time:** ~1 week part-time

- [ ] Step 7's OTel spans already carry `tokens` and `cost` per call — roll those up into per-user and per-org totals with a scheduled job (a lightweight Temporal Workflow from Step 6 is a natural fit) writing daily/monthly aggregates into a `usage_rollups` table, rather than querying raw spans live on every page load
- [ ] Quotas: a soft and hard `monthly_token_limit` per user/org, checked before a request proceeds — soft limit shows a warning banner in `apps/web`, hard limit blocks new messages with a clear in-app error instead of a raw failure
- [ ] `/settings/usage` page: current-period spend, a trend chart (reuse whatever charting approach is already in the app, e.g. Recharts), and remaining quota
- [ ] Org-admin view (ties into Step 8.5): usage broken down by member, not just the viewer's own

**Checkpoint:** A test user hits their configured quota mid-conversation and gets a clear in-app block, not a raw 500; the `/settings/usage` chart matches what Grafana shows for the same window.

---

## Step 8 — Auth & Security Hardening
**Time:** 1–2 weeks part-time

- [ ] JWT access tokens + refresh token rotation on the API gateway
- [ ] OAuth2 flow for Composio-connected third-party accounts
- [ ] Per-tool permission scopes enforced at the gateway (not just the tool router) — defense in depth
- [ ] Secrets management: move from `.env` to a proper secrets store (Docker secrets locally; Vault or cloud KMS in prod path)
- [ ] **Next.js side:** NextAuth.js (or a light custom cookie-session layer) for login; Next.js middleware protects `/chat`, `/jobs`, `/traces`, `/settings` and redirects unauthenticated users
- [ ] **SSE auth:** native `EventSource` can't set custom headers, so a JWT can't ride an `Authorization` header the way it would on a normal `fetch`/POST. Handle it one of two ways: (a) an httpOnly session cookie sent automatically with the stream request (`credentials: 'include'`), verified server-side *before* `res.flushHeaders()` — reject with a plain HTTP 401 for a missing/invalid cookie, no handshake gymnastics needed; or (b) a short-lived token in the stream URL's query string if cookies aren't an option, accepting that it can leak into access logs and rotating it accordingly. Either way, verify before writing anything to the stream — don't open it and close it after the fact, since that briefly exposes the endpoint
- [ ] **CORS:** lock Express down to `FRONTEND_URL` only, `credentials: true` if using cookie-based refresh tokens or cookie-based SSE auth

**Checkpoint:** Unauthenticated HTTP requests are rejected; a user can only trigger tools/jobs their token is scoped for; and an unauthenticated SSE stream request gets a plain 401 before any bytes are written, not a connection that's opened and dropped a moment later.

---

## Step 8.5 — Multi-Tenancy & Team Workspaces (new)
**Time:** 2–3 weeks part-time

- [ ] `organizations` and `organization_members` tables (`user_id`, `org_id`, `role`: `owner` / `admin` / `member`); every tenant-scoped row from here on — conversations, jobs, uploads, usage — gets an `org_id`
- [ ] Row-level scoping enforced at one consistent point: either Postgres RLS policies if you want it enforced at the database itself, or a single repository-layer check if not — pick one and don't mix them, since that's exactly where cross-tenant leaks slip in
- [ ] Invite flow: an owner/admin invites by email → invite token → new or existing user accepts → added to `organization_members`
- [ ] Role-gated UI and API: only `owner`/`admin` see the Step 7.5 org-wide usage view, manage billing, or remove members; `member` gets their own conversations/jobs scoped to the org's shared tool/Composio connections
- [ ] Workspace switcher in `apps/web` for users who belong to more than one org

**Checkpoint:** Two orgs, each with their own members — a user in Org A can never see Org B's conversations, jobs, or usage data even by guessing an ID; inviting a new member and having them land with the right role works end-to-end.

---

## Step 9 — Tool Layer Completion: Composio + Multi-Agent
**Time:** 3–4 weeks part-time

- [ ] Integrate Composio MCP for Gmail/Slack/GitHub/Calendar — confirm they route through the same Tool Router as custom tools
- [ ] Add 2 sub-agents (e.g. `researcher`, `coder`) with the orchestrator delegating and merging results
- [ ] Critic/verifier pass on final output before responding
- [ ] **Frontend surface:** activity feed in `apps/web` showing sub-agent delegation (`researcher` / `coder`) as collapsible steps within the chat view, sourced from the same trace events as `/traces`

**Checkpoint:** A single request ("research X and draft a summary doc, then email it to me") triggers multi-tool, multi-agent collaboration end-to-end, and you can see which sub-agent did what in the UI without opening `/traces`.

---

## Step 10 — Production Deploy Path
**Time:** 1–2 weeks part-time

- [ ] Write Kubernetes manifests (`infra/k8s/`): Deployments + Services for API, orchestrator, scheduler, each MCP server, **and a separate Deployment + Service for `apps/web`** — two independently scalable, independently deployable apps, matching the frontend decision from Step 0
- [ ] Ingress routing: frontend at `/`, API at `/api` (or a dedicated `api.` subdomain); SSE responses need proxy buffering disabled (`proxy_buffering off`, or send `X-Accel-Buffering: no`) and `nginx.ingress.kubernetes.io/proxy-read-timeout` (or equivalent) raised — SSE is just a long-lived chunked HTTP response, and a buffering ingress will hold the whole thing and deliver it in one late burst instead of streaming; default read timeouts will also kill a long-lived SSE connection the same way they'd kill a socket
- [ ] **Gotcha to document:** `NEXT_PUBLIC_*` env vars are baked into the Next.js bundle at **build time**, not read at container start — so `NEXT_PUBLIC_API_URL` needs to be set correctly in the CI build step per environment (dev/staging/prod), not just injected as pod env vars at deploy time
- [ ] Terraform for provisioning Redis/Postgres/Qdrant/Kafka (even just local/single-node counts for the resume line)
- [ ] Add PgBouncer for connection pooling in front of Postgres
- [ ] Basic Helm chart or `kustomize` overlays for dev/staging config

**Checkpoint:** `kubectl apply -f infra/k8s/` brings up a working cluster locally (kind/minikube is fine) mirroring the Docker Compose setup, with the Next.js frontend reachable at `/` and correctly talking to the API and streaming SSE responses through the ingress.

---

## Full Timeline Summary

| Step | Focus | Part-time est. |
|---|---|---|
| 0 | Env setup | 1–2 days |
| 0.5 | Next.js frontend shell (`apps/web`, shared types) | 1–2 days |
| 1 | Core loop + Redis session/rate-limit, SSE chat UI | 3–5 days |
| 1.5 | File upload, attachments & multimodal input | 1–2 weeks |
| 1.6 | Conversation management, message actions & sharing | 1–2 weeks |
| 1.7 | Loop engineering & eval pipeline | 1–2 weeks |
| 2 | Advanced RAG + Redis semantic cache | 3–4 weeks |
| 3 | Circuit breakers / resilience | 3–5 days |
| 4 | Sandboxed agentic OS layer | 3–5 weeks |
| 5 | Episodic + graph memory (+ optional CDC) | 2–3 weeks |
| 6 | Temporal-based durable cron/autonomy | 3–4 weeks |
| 6.5 | Notifications (Web Push) | 3–5 days |
| 7 | Kafka event pipeline + Prometheus/Grafana | 2–3 weeks |
| 7.5 | Usage & cost dashboard | ~1 week |
| 8 | Auth/security hardening | 1–2 weeks |
| 8.5 | Multi-tenancy & team workspaces | 2–3 weeks |
| 9 | Composio + multi-agent | 3–4 weeks |
| 10 | K8s + Terraform deploy path | 1–2 weeks |

**Total: ~28–41 weeks part-time (~6.5–9.5 months), or ~14–19 weeks full-time.**
Each original step's "frontend surface" bullet is a small UI increment (hours,
not days) folded into that step's existing estimate. The six new steps (1.5,
1.6, 1.7, 6.5, 7.5, 8.5) are the only added time blocks, and each is placed
directly after the step it depends on — 1.5/1.6/1.7 need the Step 1 chat loop,
6.5 needs Step 6's Temporal Activities, 7.5 needs Step 7's OTel spans, and 8.5
needs Step 8's auth model.

## Minimum Viable "Impressive" Cutoff
If you're working toward a deadline, **Steps 0, 0.5, 1–3 + 6 (Redis + Temporal
specifically)** gives you a working agent — with a real browser UI, not just
`curl`/Postman — with real advanced-backend credibility in **~6–8 weeks
part-time**: core loop with SSE chat in the browser, real RAG, resilience
patterns, and durable autonomous scheduling with an approval button in the UI.
That combination alone covers most of what the "2026 full-stack agent" keyword
set is looking for without needing the full Kafka/K8s buildout.

The six new feature steps sit on top of that cutoff rather than inside it —
add them once the core loop is solid. A reasonable order if you want a subset:
**1.5 (file upload)** and **1.6 (conversation management)** read as "basic
product completeness" to almost anyone evaluating the build, so they're the
first two worth adding after the cutoff; **1.7 (eval pipeline)** pays for
itself the moment you start touching RAG/resilience/memory, so pull it forward
if you're iterating on the loop a lot; **6.5, 7.5, and 8.5** are genuinely
"scale-up" concerns (notifications, billing, teams) and are the ones to cut
first under time pressure.

---

*Suggested next step: pick Step 0.5 + Step 1 and I'll extend the existing
scaffold — Next.js chat page, the `useAgentStream` hook, the Express SSE
endpoint, and the Redis session store — so you have a working browser chat UI
talking to the agent over SSE to run tonight.*
