/* Chinese Translation Quality Check: one place that talks to the Claude API.
 *
 * Live requests return one JSON answer in a fixed schema (structured outputs), with the
 * resources in a cached system block. Model, effort and max_tokens are always set per call.
 * A refusal is retried once on the server-side fallback ("default" mode). Every call adds its
 * usage to a log so the cost of a pass can be shown and capped.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk").default;

const MODELS = { sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };
// USD per million tokens: input, output, cache read; cache write is 1.25x input. Batch halves all.
const PRICE = {
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
};

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const env = path.join(__dirname, "..", ".env");
  const m = fs.existsSync(env) && fs.readFileSync(env, "utf8").match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY not found in the environment or .env");
  return m[1].trim();
}

let client = null;
function getClient() { return client || (client = new Anthropic({ apiKey: apiKey(), maxRetries: 3, timeout: 600000 })); }

function cost(model, usage, batch) {
  const p = PRICE[model]; if (!p || !usage) return 0;
  const usd = ((usage.input_tokens || 0) * p.in + (usage.output_tokens || 0) * p.out +
    (usage.cache_read_input_tokens || 0) * p.cacheRead + (usage.cache_creation_input_tokens || 0) * p.in * 1.25) / 1e6;
  return batch ? usd / 2 : usd;
}

const ledger = { calls: 0, usd: 0, byLabel: {} };
function record(label, model, usage, batch) {
  const usd = cost(model, usage, batch);
  ledger.calls += 1; ledger.usd += usd;
  const b = ledger.byLabel[label] || (ledger.byLabel[label] = { calls: 0, usd: 0, input: 0, output: 0, cacheRead: 0 });
  b.calls += 1; b.usd += usd; b.input += usage.input_tokens || 0; b.output += usage.output_tokens || 0;
  b.cacheRead += usage.cache_read_input_tokens || 0;
  return usd;
}

/** Body shared by the live path and the batch path, so both send the same request. */
function requestBody({ model, system, user, schema, effort, maxTokens }) {
  return {
    model, max_tokens: maxTokens,
    output_config: { effort, format: { type: "json_schema", schema } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  };
}

function parseAnswer(msg) {
  if (msg.stop_reason === "refusal") return { ok: false, error: { category: "refusal", retryable: true, message: (msg.stop_details && msg.stop_details.category) || "refusal" } };
  if (msg.stop_reason === "max_tokens") return { ok: false, error: { category: "max_tokens", retryable: true, message: "answer cut off at max_tokens; split the range" } };
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try { return { ok: true, data: JSON.parse(text) }; }
  catch (e) { return { ok: false, error: { category: "invalid_json", retryable: true, message: e.message } }; }
}

/** One live call. Returns { ok, data | error, usage, usd }. */
async function callJSON(opts) {
  const body = requestBody(opts);
  const c = getClient();
  let msg = await c.messages.create(body);
  let usd = record(opts.label || "live", opts.model, msg.usage, false);
  if (msg.stop_reason === "refusal") {
    // One retry on the server-side fallback (Claude API, live only; the Batches API rejects it).
    msg = await c.beta.messages.create({ ...body, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    usd += record((opts.label || "live") + ":fallback", msg.model || opts.model, msg.usage, false);
  }
  return { ...parseAnswer(msg), usage: msg.usage, usd, model: msg.model };
}

/** Run async jobs with a concurrency limit, keeping result order. */
async function pool(items, limit, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

module.exports = { MODELS, PRICE, getClient, requestBody, parseAnswer, callJSON, cost, record, ledger, pool };
