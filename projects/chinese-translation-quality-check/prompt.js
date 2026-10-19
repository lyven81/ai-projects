/* Specialist prompts and the requests built from them.
 *
 * One prompt per specialist, from its point of the brief, with the categories it may use. The system
 * block is frozen per specialist (instructions first, then the resources), so it caches across every
 * request of a pass; the paragraphs come last, in the user message. One round: the specialist answers
 * once with JSON in the shape of schema/finding.json. Findings are written in English (issue and
 * reason) so any reviewer can read them; the suggestion is the corrected Chinese.
 */
"use strict";
const { brief, glossaryMd, houseStyleMd } = require("./lib/config.js");

const COMMON = `You are one member of a team that checks the Chinese version of a listed company's quarterly report against its English original before release. You only propose findings; an editor decides every one. You do not retranslate whole paragraphs and you never reorder them: propose the smallest change that fixes the problem.

Rules for every finding:
- target: P1 to P44 for a paragraph, F1 to F4 for the front matter.
- en_span: the English words the finding rests on, copied exactly from that target's English.
- zh_span: the Chinese words at issue, copied exactly from that target's Chinese; it must be text that is really there. For an omission, take the Chinese next to the gap.
- issue: what is wrong, in one English sentence. reason: why, in one English sentence, naming the English meaning where accuracy is concerned.
- suggestion: the corrected Chinese that replaces zh_span exactly (it is pasted in place of zh_span), in full-width punctuation. For an addition, leave it empty to delete zh_span. For any other category, an empty suggestion makes the finding a comment only.
- source: a brief point (B1 to B4), a house style rule (H1 to H8) or a glossary entry (G01 to G30). Nothing else.
- severity: must (wrong or misleading if released) or should (a clear improvement). Do not report optional preferences.
- One finding fixes the whole problem: when the same fault appears more than once in a sentence (for example two wrong marks), make zh_span cover all of them so the suggestion corrects every one.
- The glossary stage has already corrected the glossary terms: do not report them.
- F4 is a protected passage: only accuracy findings there, each with the corrected Chinese as its suggestion (for a missing part, the span with the missing words restored, in the English's order); no wording, tone or punctuation findings there.
- done lists every paragraph number you read in full (only the ones assigned to you), including paragraphs with no findings. Findings may be an empty array.`;

const ROLE = {
  accuracy: `Your job (brief B1): compare every sentence with the English and find what is missing, wrong or added.
- omission: meaning in the English that the Chinese leaves out, including a whole sentence.
- mistranslation: meaning that differs from the English: a figure, a unit conversion (RM million to 万令吉 or 亿令吉, H2), a comparison period, the direction of a change, a negation, cause and effect.
- addition: meaning in the Chinese that is not in the English.
Check every figure and every conversion against the English. Allowed categories: omission, mistranslation, addition.`,
  section: `Your job (brief B2): within each paragraph, check wording, fluency, structure, punctuation and quotation marks against the house style.
- wording: an inexact, stiff or literal word choice.
- fluency: a sentence that does not read as natural written Chinese, such as a run-on sentence.
- structure: the logic between clauses or sentences is wrong or unclear.
- punctuation: half-width or wrong punctuation (H1).
- quotation: quotation marks that do not open and close as the house style requires (H4).
Allowed categories: wording, fluency, structure, punctuation, quotation. Keep the formal register of a disclosure.`,
  register: `Your job (brief B3): check the tone. A disclosure reports in a measured way, like the English.
- Promotional or exaggerated words where the English is plain (H7).
- Colloquial or casual expressions that do not belong in a regulatory filing.
Report only tone; leave accuracy and grammar to the other specialists. Allowed category: register.`,
};

const RESOURCES = [brief, houseStyleMd(), glossaryMd()];

/** The frozen system block for a specialist. */
function systemPrompt(specialist) {
  return [COMMON, ROLE[specialist], ...RESOURCES].join("\n\n---\n\n");
}

function block(t, assigned) {
  const lines = [`[${t.key}]${t.name ? ` ${t.name}` : ""}${assigned ? "" : " (context only, do not review)"}`];
  if (t.heading_en) lines.push(`Heading: ${t.heading_en}`);
  lines.push(`EN: ${t.en}`, `ZH: ${t.zh}`);
  if (assigned && t.protected.length) lines.push("Protected passage: the whole of this target (accuracy corrections only).");
  return lines.join("\n");
}

/** User message for a request over paragraphs [from..to], with one neighbour each side. */
function userMessage(doc, specialist, from, to, withFront) {
  const parts = [];
  if (withFront) for (const t of doc.targets.filter((x) => !x.n)) parts.push(block(t, true));
  if (from > 1) parts.push(block(doc.byN[from - 1], false));
  for (let n = from; n <= to; n++) parts.push(block(doc.byN[n], true));
  if (to < doc.paragraphs) parts.push(block(doc.byN[to + 1], false));
  const head = `Review P${from} to P${to}${withFront ? " and the front matter F1 to F4" : ""}. Report findings only on these targets.`;
  return `${head}\n\n${parts.join("\n\n")}`;
}

/** The requests for one section: accuracy in two halves of about 10, one section request, one register request. */
function sectionRequests(doc, section, specialists = ["accuracy", "section", "register"]) {
  const reqs = [];
  const mid = Math.min(section.to, section.from + 9);
  const id = (sp, a, b) => `${section.id}-${sp.slice(0, 3)}-p${String(a).padStart(3, "0")}-${String(b).padStart(3, "0")}`;
  if (specialists.includes("accuracy")) {
    reqs.push({ custom_id: id("accuracy", section.from, mid), specialist: "accuracy", from: section.from, to: mid, front: section.front_matter });
    if (mid < section.to) reqs.push({ custom_id: id("accuracy", mid + 1, section.to), specialist: "accuracy", from: mid + 1, to: section.to, front: false });
  }
  if (specialists.includes("section")) reqs.push({ custom_id: id("section", section.from, section.to), specialist: "section", from: section.from, to: section.to, front: section.front_matter });
  if (specialists.includes("register")) reqs.push({ custom_id: id("register", section.from, section.to), specialist: "register", from: section.from, to: section.to, front: section.front_matter });
  return reqs;
}

module.exports = { systemPrompt, userMessage, sectionRequests, ROLE };
