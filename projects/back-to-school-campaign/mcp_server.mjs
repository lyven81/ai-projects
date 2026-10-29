// The in-process MCP server (createSdkMcpServer, tool()): the three resources, extract_facts, ask_owner,
// deliver, the five writer output tools and report_findings. One server per run, bound to that run's state.
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { extractFacts, CHANNELS, TONES } from "./lib/facts.mjs";
import { readResource, URIS } from "./lib/resources.mjs";
import { askOwner, deliver, storeCopy, reportFindings } from "./lib/tools.mjs";

export const SERVER = "kiddoz";
export const mcp = (name) => `mcp__${SERVER}__${name}`;
const reply = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
const fail = (msg) => ({ content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }], isError: true });

const claims = z.array(z.object({
  text: z.string().describe("The claim as written in the copy"),
  fact_id: z.string().describe("The fact ID it rests on, for example P-PB01 or F-PERIOD"),
  sku: z.string().optional().describe("The product's SKU when the claim is about a product"),
})).describe("Every factual claim in the copy, each citing a fact ID; every featured product cited by its SKU");

/**
 * ctx: { state, ownerMessage, overrides, carried, onFacts }
 * The owner's message reaches extract_facts from the runner, never from the model.
 */
export function makeServer(ctx) {
  const writer = (name, channel, shape, desc) => tool(name, desc, { ...shape, claims }, async (input) => reply(storeCopy(ctx.state, channel, input)));
  const server = createSdkMcpServer({
    name: SERVER, version: "1.0.0",
    instructions: "Kiddoz Uniform House campaign tools. Resources: kiddoz://store-profile, kiddoz://price-list, kiddoz://channel-guide.",
    tools: [
      tool("extract_facts", "Turn the owner's brief into checked campaign facts. Runs first, on every new owner message. Give your reading of the brief; code checks every SKU, price, discount, date and claim against the price list and the owner's own words, and returns the facts with IDs and sources plus any owner question that must be asked.", {
        channels: z.array(z.enum(CHANNELS)).describe("The channels the owner asked for"),
        tone: z.enum(TONES).optional().describe("The tone the owner named, if any"),
        skus: z.array(z.string()).describe("The SKUs of the products the owner asked to feature"),
        requirements: z.array(z.string()).optional().describe("Only an instruction beyond the channels, tone, products, prices and dates, in the owner's words, for example 'Both must invite parents to contact us through WhatsApp'. Leave empty when there is none."),
        urgency: z.boolean().optional().describe("True when the owner asked for more urgent copy"),
      }, async (reading) => {
        const r = extractFacts(reading, ctx.ownerMessage, { overrides: ctx.overrides, carried: ctx.carried });
        ctx.onFacts(r);
        if (r.status === "resource_error") return { ...reply(r), isError: true };
        return reply(r);
      }),
      tool("ask_owner", "Ask Puan Zarina one question on a fixed reason: O1 missing fact, O2 product not on the price list, O3 claim not allowed, O4 contradiction with the price list, O5 a channel still failing after two corrections. The waiting channels hold until she answers.", {
        code: z.enum(["O1", "O2", "O3", "O4", "O5"]), item: z.string().describe("The missing or conflicting item, for example PB01 or dates"),
        question: z.string().describe("One sentence to the owner, ending with a question mark"), channels: z.array(z.enum(CHANNELS)).describe("The channels waiting on the answer"),
      }, async (a) => { const r = askOwner(ctx.state, a); return r.ok ? reply(r) : fail(r.error); }),
      tool("deliver", "Hand the campaign to the owner: every requested channel with its status, ready_for_approval, waiting_for_owner or failed. Nothing is posted and nothing is approved here; only the owner approves.", {
        channels: z.array(z.object({ channel: z.enum(CHANNELS), status: z.enum(["ready_for_approval", "waiting_for_owner", "failed"]), note: z.string().optional() })),
        summary: z.string().describe("Two short sentences to the owner on what is ready and what waits for her"),
      }, async (a) => { const r = deliver(ctx.state, a); return r.ok ? reply(r) : fail(r.error); }),
      writer("write_whatsapp", "whatsapp", { message: z.string().describe("The broadcast, 4 to 6 lines, the last a call to action") }, "Return the WhatsApp broadcast."),
      writer("write_instagram", "instagram", { caption: z.string().describe("Hook line first, 3 to 5 short paragraphs in all, separated by blank lines, no hashtags"), hashtags: z.array(z.string()).describe("5 to 8 Bahasa Melayu hashtags") }, "Return the Instagram caption and hashtags."),
      writer("write_email", "email", { emails: z.array(z.object({ label: z.enum(["Teaser", "Tawaran", "Last Call"]), subject: z.string(), body: z.string().describe("Greets the reader with [Nama]") })).describe("Exactly three emails: Teaser, Tawaran, Last Call") }, "Return the three-email sequence."),
      writer("write_blog", "blog", { title: z.string(), body: z.string().describe("300 to 500 words") }, "Return the blog post."),
      writer("write_seo", "seo", { paragraph: z.string().describe("150 to 200 words for the shop's page"), meta_description: z.string().describe("At most 160 characters") }, "Return the Google search paragraph and meta description."),
      tool("report_findings", "Report the independent review: a verdict for every channel you were given, checked against the facts and the owner's requirements, then one pass across all channels for the same offer, prices and dates.", {
        channels: z.array(z.object({ channel: z.enum(CHANNELS), pass: z.boolean(), findings: z.array(z.object({ fact_or_clause: z.string().describe("The fact ID, requirement ID or clause, for example R1 or G1"), problem: z.string() })).optional() })),
        cross_channel: z.array(z.object({ channels: z.array(z.enum(CHANNELS)), fact_or_clause: z.string().optional(), problem: z.string() })).optional().describe("Only real differences in offer, prices or dates that need a fix, naming only the channel(s) that must change; empty when the channels agree"),
      }, async (a) => { const r = reportFindings(ctx.state, ctx.state.reviewing || [], a); return r.ok ? reply(r) : fail(r.error); }),
    ],
  });
  // The three resources, listed and readable through MCP; extract_facts reads the same files through lib/resources.mjs.
  for (const uri of URIS) {
    server.instance.registerResource(uri.replace("kiddoz://", ""), uri, { mimeType: "application/json" }, async () => {
      const data = readResource(uri, ctx.overrides);
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data) }] };
    });
  }
  return server;
}
