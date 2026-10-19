/* Request settings and the answer schema per specialist.
 *
 * Model, effort and max_tokens are set here for every request, on the live path and in the batch,
 * so the two paths send the same thing. Thinking is adaptive on these models and cannot be turned
 * off; effort is the control. The answer schema is schema/finding.json with the category enum
 * narrowed to what the specialist may use (tools.js ALLOWED, the same list the checks use).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { MODELS } = require("./claude.js");
const { ALLOWED } = require("../tools.js");

const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "schema", "finding.json"), "utf8"));

const SETTINGS = {
  accuracy: { model: MODELS.sonnet, effort: "high", maxTokens: 16000, label: "accuracy" },
  section: { model: MODELS.sonnet, effort: "high", maxTokens: 32000, label: "section" },   // 20 paragraphs can run past 16000
  register: { model: MODELS.opus, effort: "medium", maxTokens: 32000, label: "register" },
  grader: { model: MODELS.opus, effort: "medium", maxTokens: 16000, label: "grader" },
  consolidator: { model: MODELS.sonnet, effort: "high", maxTokens: 8000, label: "consolidator" },
  coordinator: { model: MODELS.sonnet, effort: "medium", maxTokens: 4000, label: "coordinator" },
};

function answerSchema(specialist) {
  const finding = JSON.parse(JSON.stringify(BASE.finding));
  finding.properties.category.enum = ALLOWED[specialist];
  return {
    type: "object", additionalProperties: false, required: ["findings", "done"],
    properties: { findings: { type: "array", items: finding }, done: { type: "array", items: { type: "integer" } } },
  };
}

const GRADE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["notes"],
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["id", "verdict", "note"],
        properties: { id: { type: "string" }, verdict: { type: "string", enum: ["sound", "doubtful", "wrong"] }, note: { type: "string" } },
      },
    },
  },
};

const COMBINE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["zh_span", "suggestion", "issue", "reason"],
  properties: { zh_span: { type: "string" }, suggestion: { type: "string" }, issue: { type: "string" }, reason: { type: "string" } },
};

module.exports = { SETTINGS, answerSchema, GRADE_SCHEMA, COMBINE_SCHEMA };
