// The sample customer agent: Claude Haiku 5.5 as an A2A client (ClientFactory with the JSON-RPC transport), given one
// person's request per A2A case. A caller only: the other party's agent is the setting, not the subject, so its
// prompt, its messages and its decisions are not scored; only what reaches the restaurant assistant is tested.
//
// It sends the person's request, answers the restaurant's questions from the person's facts, and stops when the room
// is held (the person confirms on their own phone), when the task ends, or after maxTurns messages. The person's name
// and phone go in every message's metadata in the fixed form { customer: { name, phone } }.
//
// runCustomerAgent({ url, person, request, facts, apiKey, model, maxTurns, fetchImpl }) -> { task, exchanges, usage }
import { ClientFactory } from "@a2a-js/sdk/client";
import { Role } from "@a2a-js/sdk";
import { STATE_NAME, textPart, partsText, partsData } from "./server.mjs";

const MODEL = "claude-haiku-5-5";

async function haiku({ apiKey, model, system, messages, fetchImpl, usage }) {
  const res = await (fetchImpl || fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model || MODEL, max_tokens: 300, system, messages }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) usage[k] = (usage[k] || 0) + ((data.usage && data.usage[k]) || 0);
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
}

export async function runCustomerAgent(o) {
  const usage = {};
  const client = await new ClientFactory().createFromUrl(o.url);
  const system = `You are the personal AI agent of ${o.person.name}. You book restaurants for ${o.person.name} by messaging the restaurant's own agent through A2A.
Write only the text of your next message to the restaurant: one or two short sentences, polite and plain.
Send the person's request as given: ask the restaurant to book it, not only whether it is free, and add no detail the request does not contain. When the restaurant asks a question, answer it from the facts below and nothing else. When the restaurant offers a room that fits the request, accept it. Ask about nothing outside the request. Never invent a detail and never say the person has confirmed anything.
The person's request: "${o.request}"
Facts you may give when asked: ${Object.entries(o.facts || {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("; ")}.`;
  const chat = [{ role: "user", content: "Write your first message to the restaurant." }];
  const exchanges = [];
  let task = null;
  for (let i = 0; i < (o.maxTurns || 4); i++) {
    const text = await haiku({ apiKey: o.apiKey, model: o.model, system, messages: chat, fetchImpl: o.fetchImpl, usage });
    chat.push({ role: "assistant", content: text });
    const message = { messageId: crypto.randomUUID(), role: Role.ROLE_USER, parts: [textPart(text)], metadata: { customer: { name: o.person.name, phone: o.person.phone } } };
    if (task) { message.taskId = task.id; message.contextId = task.contextId; }
    const r = await client.sendMessage({ message });
    task = r && r.id ? r : (r && r.task) || r;
    const st = STATE_NAME[task.status.state];
    const reply = partsText(task.status.message && task.status.message.parts);
    const data = partsData(task.status.message && task.status.message.parts);
    exchanges.push({ sent: text, reply, state: st, data });
    if (st !== "input-required" || (data && data.outcome === "held")) break;
    chat.push({ role: "user", content: `The restaurant replied: "${reply}" Write your next message to the restaurant.` });
  }
  return { task, exchanges, usage, client };
}
