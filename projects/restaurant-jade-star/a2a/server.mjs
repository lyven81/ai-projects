// Jade Star Chinese Dining 吉星饭厅: the A2A server around the restaurant assistant (@a2a-js/sdk 1.3.0, A2A Protocol
// Specification v1.0.0): the Agent Card, DefaultRequestHandler with InMemoryTaskStore, and the JSON-RPC handler.
//
// A customer agent's message opens a task (submitted, then working while the assistant checks the room). The
// assistant (agent.js, the same loop as chat) answers through the same four tools on the same booking module.
// Task states are the protocol layer, moved by code, never by the assistant:
//   room held          -> input-required, with the proposal in a data part (the person confirms on their own phone)
//   a question asked   -> input-required (the customer agent answers in the same task)
//   handover           -> completed, with the handover note in a data part and no booking
//   confirmed          -> completed with the booking number (moved by the booking module's "confirmed" event)
//   released           -> failed (moved by the 15-minute release)
// The person's name and phone come in the message's metadata in a fixed form, { customer: { name, phone } }, never
// from the text; a first message without it is rejected. Every message both ways is saved to the A2A message log.
//
// startA2AServer({ booking, desk, apiKey, system, port, runTurn, fetchImpl, model }) -> { url, close, log, tasks }
// Run on its own: node a2a/server.mjs   (port 41241, test clock, needs ANTHROPIC_API_KEY)
import express from "express";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultRequestHandler, InMemoryTaskStore, AgentEvent } from "@a2a-js/sdk/server";
import { jsonRpcHandler, agentCardHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { TaskState, Role, AGENT_CARD_PATH } from "@a2a-js/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(import.meta.url);
const B = require(join(ROOT, "lib", "booking.js"));
const A = require(join(ROOT, "agent.js"));

export const STATE_NAME = { [TaskState.TASK_STATE_SUBMITTED]: "submitted", [TaskState.TASK_STATE_WORKING]: "working", [TaskState.TASK_STATE_INPUT_REQUIRED]: "input-required",
  [TaskState.TASK_STATE_COMPLETED]: "completed", [TaskState.TASK_STATE_FAILED]: "failed", [TaskState.TASK_STATE_REJECTED]: "rejected", [TaskState.TASK_STATE_CANCELED]: "canceled" };

export const textPart = (value) => ({ content: { $case: "text", value }, metadata: undefined, filename: "", mediaType: "text/plain" });
export const dataPart = (value) => ({ content: { $case: "data", value }, metadata: undefined, filename: "", mediaType: "application/json" });
export const partsText = (parts) => (parts || []).filter((p) => p.content && p.content.$case === "text").map((p) => p.content.value).join("\n").trim();
export const partsData = (parts) => (parts || []).filter((p) => p.content && p.content.$case === "data").map((p) => p.content.value)[0] || null;

export function agentCard(url) {
  return {
    name: "Jade Star Chinese Dining 吉星饭厅, restaurant assistant",
    description: "Books the private rooms of Jade Star Chinese Dining 吉星饭厅 for December 2026 for a customer agent acting for one person. The room is held 15 minutes; the person confirms with a 6-digit code sent to their phone. Send the person's name and phone in message metadata as { customer: { name, phone } }.",
    supportedInterfaces: [{ url: `${url}/a2a/jsonrpc`, protocolBinding: "JSONRPC", protocolVersion: "1.0", tenant: "" }],
    provider: undefined, version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    securitySchemes: {}, securityRequirements: [], defaultInputModes: ["text/plain", "application/json"], defaultOutputModes: ["text/plain", "application/json"],
    skills: [{ id: "private-room-booking", name: "Private room booking", description: "Check and hold a private room for a date, slot and party size in December 2026; hand anything else to the restaurant manager.",
      tags: ["restaurant", "booking"], examples: ["A private room for 5 on Wed 16 Dec 2026 at 4pm"], inputModes: ["text/plain"], outputModes: ["text/plain", "application/json"], securityRequirements: [] }],
    signatures: [],
  };
}

export async function startA2AServer(opts) {
  const { booking, desk } = opts;
  const runTurn = opts.runTurn || A.runTurn;
  const log = [];
  const store = new InMemoryTaskStore();
  const convs = new Map(); // contextId -> { session, messages, taskId, serverCtx, first }
  const toolList = Object.entries(desk.TOOLS).map(([name, t]) => Object.assign({ name }, t));
  const at = () => B.iso(booking.now());
  const stamp = () => new Date(booking.now()).toISOString();
  const record = (e) => { log.push(Object.assign({ at: at() }, e)); };
  const msg = (rc, text, data) => ({ messageId: crypto.randomUUID(), contextId: rc.contextId, taskId: rc.taskId, role: Role.ROLE_AGENT,
    parts: [textPart(text)].concat(data ? [dataPart(data)] : []), metadata: undefined, extensions: [], referenceTaskIds: [] });
  const status = (bus, rc, state, message) => bus.publish(AgentEvent.statusUpdate({ taskId: rc.taskId, contextId: rc.contextId, status: { state, message, timestamp: stamp() }, metadata: undefined }));

  const executor = {
    async execute(rc, bus) {
      const m = rc.userMessage;
      const text = partsText(m.parts);
      const cust = m.metadata && m.metadata.customer;
      let c = convs.get(rc.contextId);
      if (!rc.task) bus.publish(AgentEvent.task({ id: rc.taskId, contextId: rc.contextId, status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: stamp() }, artifacts: [], history: [m], metadata: {} }));
      record({ from: "customer agent", task_id: rc.taskId, state: rc.task ? STATE_NAME[rc.task.status.state] : "submitted", text, data: m.metadata || null });
      if (!c) {
        if (!cust || typeof cust.name !== "string" || typeof cust.phone !== "string" || !cust.name.trim() || !cust.phone.trim()) {
          const reply = "Please send the person's name and phone in the message metadata as { customer: { name, phone } }.";
          status(bus, rc, TaskState.TASK_STATE_REJECTED, msg(rc, reply));
          record({ from: "restaurant assistant", task_id: rc.taskId, state: "rejected", text: reply });
          bus.finished(); return;
        }
        c = { session: desk.newSession({ conversation: rc.contextId, name: cust.name.trim(), phone: cust.phone.trim(), route: "A2A agent" }), messages: [], taskId: rc.taskId, serverCtx: rc.context, first: true };
        convs.set(rc.contextId, c);
      }
      c.serverCtx = rc.context; c.taskId = rc.taskId;
      status(bus, rc, TaskState.TASK_STATE_WORKING, undefined);
      record({ from: "booking system", task_id: rc.taskId, state: "working", text: "" });
      c.session.turn++; c.session.last_message = text;
      c.messages.push({ role: "user", content: text });
      let out;
      try {
        out = await runTurn({ apiKey: opts.apiKey, model: opts.model, system: opts.system, tools: toolList, messages: c.messages, first: c.first, route: "A2A agent", fetchImpl: opts.fetchImpl, callTool: (n, i) => desk.call(c.session, n, i) });
      } catch (e) {
        const reply = "Sorry, the restaurant assistant could not answer just now. Please try again in a moment.";
        status(bus, rc, TaskState.TASK_STATE_FAILED, msg(rc, reply, { error: String(e.message || e).slice(0, 200) }));
        record({ from: "restaurant assistant", task_id: rc.taskId, state: "failed", text: reply });
        bus.finished(); throw e;
      }
      c.first = false;
      (c.turns = c.turns || []).push({ message: text, reply: out.reply, trace: out.trace, usage: out.usage, stoppedBy: out.stoppedBy, fixesLeft: out.fixesLeft, reworded: out.reworded, sentBack: out.sentBack });
      const calls = out.trace.filter((x) => x.type === "tool");
      const handover = calls.filter((x) => x.name === "hand_to_manager" && x.result.status === "ok").slice(-1)[0];
      const held = desk.heldInConversation(c.session);
      let state, data;
      if (handover) {
        const h = booking.state.handovers.find((x) => x.ref === handover.result.data.handover_ref);
        state = TaskState.TASK_STATE_COMPLETED;
        data = { outcome: "handover", handover_note: h, booking: null };
      } else if (held) {
        state = TaskState.TASK_STATE_INPUT_REQUIRED;
        data = { outcome: "held", proposal_ref: held.ref, room: booking.roomLabel(held.room_id), date: held.date, slot: held.slot, party_size: held.party_size, expires_at: held.expires_at,
          confirm: "The person confirms with the 6-digit code sent by SMS to their phone. No agent can confirm." };
      } else {
        state = TaskState.TASK_STATE_INPUT_REQUIRED;
        data = null;
      }
      status(bus, rc, state, msg(rc, out.reply, data));
      record({ from: "restaurant assistant", task_id: rc.taskId, state: STATE_NAME[state], text: out.reply, data });
      bus.finished();
    },
    async cancelTask(taskId, bus) { bus.finished(); },
  };

  // Code moves the task when the booking moves: the person's confirmation completes it, the release fails it.
  booking.on(async (type, data) => {
    const p = type === "confirmed" ? data.proposal : type === "released" ? data : null;
    if (!p || p.route !== "A2A agent") return;
    const c = convs.get(p.conversation);
    if (!c) return;
    const task = await store.load(c.taskId, c.serverCtx);
    if (!task) return;
    const done = type === "confirmed";
    const text = done ? `Booking ${p.booking_no} is confirmed by the person: ${booking.roomLabel(p.room_id)}, ${B.dateLabel(p.date)}, ${B.slotLabel(p.slot)}, ${p.party_size} guests. The RM 100 booking fee is added to the bill at check-out.`
      : `The hold on ${booking.roomLabel(p.room_id)} was not confirmed within 15 minutes and has been released.`;
    const d = done ? { outcome: "confirmed", booking_number: p.booking_no, proposal_ref: p.ref } : { outcome: "released", proposal_ref: p.ref };
    task.status = { state: done ? TaskState.TASK_STATE_COMPLETED : TaskState.TASK_STATE_FAILED, timestamp: stamp(),
      message: { messageId: crypto.randomUUID(), contextId: task.contextId, taskId: task.id, role: Role.ROLE_AGENT, parts: [textPart(text), dataPart(d)], metadata: undefined, extensions: [], referenceTaskIds: [] } };
    task.history = (task.history || []).concat([task.status.message]);
    await store.save(task, c.serverCtx);
    record({ from: "booking system", task_id: task.id, state: done ? "completed" : "failed", text, data: d });
  });

  const app = express();
  let url = "";
  const handler = new DefaultRequestHandler(agentCard("http://placeholder"), store, executor);
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: { getAgentCard: async () => agentCard(url) } }));
  app.use("/a2a/jsonrpc", jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
  const server = await new Promise((res) => { const s = app.listen(opts.port || 0, "127.0.0.1", () => res(s)); });
  url = `http://127.0.0.1:${server.address().port}`;
  return { url, log, store, convs, close: () => new Promise((r) => server.close(r)), conversation: (id) => convs.get(id) };
}

// ---------------------------------------------------------------- run on its own
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { createDesk } = require(join(ROOT, "tools.js"));
  const P = require(join(ROOT, "prompt.js"));
  const config = JSON.parse(readFileSync(join(ROOT, "resources", "restaurant.json"), "utf8"));
  const state = JSON.parse(readFileSync(join(ROOT, "data", "state.json"), "utf8"));
  const t0 = B.ms(config.today), start = Date.now();
  const booking = B.createBooking({ config, state, clock: () => t0 + (Date.now() - start) });
  const resources = config.resources.map((r) => Object.assign({ text: readFileSync(join(ROOT, "resources", r.file), "utf8") }, r));
  const system = P.system(resources, config, { now: "Mon 14 Dec 2026, 2:00pm", route: "A2A agent" });
  const srv = await startA2AServer({ booking, desk: createDesk({ booking }), apiKey: process.env.ANTHROPIC_API_KEY, system, port: Number(process.env.PORT || 41241) });
  console.log(`Jade Star A2A server on ${srv.url} (Agent Card at ${srv.url}/${AGENT_CARD_PATH})`);
  setInterval(() => booking.sweep(), 30000);
}
