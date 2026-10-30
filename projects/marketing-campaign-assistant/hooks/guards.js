/* Hooks around the tools (the Agent SDK pattern, kept small and in code).
 *
 *  guardNextRead(config, load): the reader check_plan uses for next-period results. It refuses before the
 *    next period closes, whatever the caller. check_plan already returns period_not_closed first; this is the
 *    second guard, so a fault in a tool can never leak next-period figures.
 *  toolLogger(write): PostToolUse. Writes one line per tool call (tool, input, ok, error) to the tool log the
 *    benchmark scores. Never writes an API key: inputs are scanned and any key-shaped text is replaced.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ComelHooks = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const KEY = /sk-ant-[A-Za-z0-9_\-]{8,}/g;

  function guardNextRead(config, load) {
    return function readNext() {
      if (!(config.today > config.next_period.end)) {
        const err = new Error(`hook: next-period results are closed until ${config.next_period.end} has passed`);
        err.category = "period_not_closed";
        throw err;
      }
      return load();
    };
  }

  function scrub(v) { return JSON.parse(JSON.stringify(v === undefined ? null : v).replace(KEY, "[removed]")); }

  function toolLogger(write) {
    return function log(entry) { write(Object.assign({ at: new Date().toISOString() }, scrub(entry))); };
  }

  return { guardNextRead, toolLogger, KEY };
});
