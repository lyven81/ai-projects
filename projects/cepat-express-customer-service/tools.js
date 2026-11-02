/* Cepat Express Customer Service: the four tools, with every limit, check, route and fixed sentence in code.
 * Shared by the MCP server, the benchmark and the demo page (runs in Node and the browser).
 *
 *   get_shipment_status  status on the tracking number alone (S4); limits C5, C6, C7, C15 computed here;
 *                        past C5/C6/C7 it raises the delay or failed-delivery flag once, to the named officer (S20, S20a)
 *   verify_customer      phone on the parcel (sender or recipient); 3 failed matches lock that tracking number (S6)
 *   get_parcel_details   recipient, address, proof of delivery, only after verify_customer (S4, C10)
 *   escalate_case        one of 16 fixed reasons, checked against the record; code picks the kind, location and
 *                        person (S10 to S20b, S20a); S26 fields required; returns the fixed S27 sentence
 *
 * No tool changes a parcel record, books a pickup, moves money or sends a case to another department (S3).
 * Every result has one shape: { tool, status: "ok" | "refused", data, error: { code, clause, message }, next_step }.
 * Times are Malaysia time written "YYYY-MM-DDTHH:MM" and computed as if UTC (no offset arithmetic needed).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CXTools = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const HOUR = 3600 * 1000;

  // ------------------------------------------------------------------ time
  const ms = (s) => { const [d, tm = "00:00"] = String(s).split("T"); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = tm.split(":").map(Number); return Date.UTC(y, m - 1, dd, h, mi); };
  const iso = (t) => new Date(t).toISOString().slice(0, 16);
  const dateLabel = (s) => { const d = new Date(ms(s)); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const timeLabel = (s) => { const d = new Date(ms(s)); let h = d.getUTCHours(); const m = d.getUTCMinutes(); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${ap}`; };
  const label = (s) => `${dateLabel(s)}, ${timeLabel(s)}`;

  function calendar(tables) {
    const holidays = new Set((tables.public_holidays || []).map((h) => h.date));
    const working = (day) => { const d = new Date(ms(day)).getUTCDay(); return d !== 0 && d !== 6 && !holidays.has(day); };
    /** The n-th working day after `day` (a date "YYYY-MM-DD"). */
    function addWorkingDays(day, n) {
      let t = ms(day), k = 0;
      while (k < n) { t += 24 * HOUR; if (working(iso(t).slice(0, 10))) k++; }
      return iso(t).slice(0, 10);
    }
    return { working, addWorkingDays };
  }

  const digits = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("60")) d = "0" + d.slice(2); return d; };
  const mask = (p) => { const d = digits(p); return d.length > 4 ? d.slice(0, 3) + "*".repeat(d.length - 7) + "-" + d.slice(-4) : d; };
  const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ""));

  function memoryStore(data) {
    const cache = JSON.parse(JSON.stringify(data));
    return { get: (n) => cache[n], set: (n, v) => { cache[n] = v; } };
  }

  // ------------------------------------------------------------------ the status, computed from the record
  /** statusOf(parcel, nowIso, tables) -> what the record shows now and which limit applies. Never a personal field. */
  function statusOf(p, now, tables) {
    const cal = calendar(tables);
    const L = tables.limits;
    const scans = p.scans;
    const last = scans[scans.length - 1];
    const st = last.status;
    const hours = Math.round(((ms(now) - ms(last.at)) / HOUR) * 10) / 10;
    const pickup = scans.find((s) => s.status === "D2");
    const attempts = scans.filter((s) => s.status === "D6").length;
    const out = {
      tracking_number: p.tracking_number,
      status: { id: st, name: tables.statuses[st] },
      shipped: st !== "D1",
      last_scan: Object.assign({ at: last.at, at_label: label(last.at), location: last.location, status: tables.statuses[st] }, last.reason ? { reason: last.reason } : {}),
      hours_since_last_scan: hours,
      delivery_location: p.delivery_location,
      scans: scans.map((s) => Object.assign({ at_label: label(s.at), status: tables.statuses[s.status], location: s.location }, s.reason ? { reason: s.reason } : {})),
      attempts,
      limit: { state: "none", clause: null },
      clauses: [st],
    };
    if (pickup) out.picked_up = label(pickup.at);
    if (pickup && ["D2", "D3", "D4"].includes(st)) {
      const due = cal.addWorkingDays(pickup.at.slice(0, 10), L.delivery_working_days);
      out.expected_delivery = dateLabel(due);
      out.expected_date_passed = due < now.slice(0, 10);
      out.clauses.push("C4");
    }
    if (st === "D5") out.delivery_by = `${dateLabel(last.at)}, 9:00 pm`;
    if (st === "D7") out.delivered_at = label(last.at);
    if (st === "D1") out.clauses.push("C2");
    if (st === "D6") {
      out.clauses.push("C9");
      if (attempts <= L.reattempts) out.reattempt_date = dateLabel(cal.addWorkingDays(last.at.slice(0, 10), 1));
      else out.last_collection_day = dateLabel(cal.addWorkingDays(last.at.slice(0, 10), L.branch_hold_working_days));
    }
    // Limits (C5, C6, C7, C15), one state per parcel.
    if (st === "D5") {
      const cutoff = last.at.slice(0, 10) + "T" + L.out_for_delivery_cutoff;
      out.limit = ms(now) >= ms(cutoff) ? { state: "failed", clause: "C7" } : { state: "within", clause: "C7" };
    } else if (["D2", "D3", "D4"].includes(st)) {
      if (hours > L.no_scan_lost_hours) out.limit = { state: "lost", clause: "C15" };
      else if (st === "D3" && hours > L.hub_delayed_hours) out.limit = { state: "delayed", clause: "C6" };
      else if (hours > L.no_scan_delayed_hours) out.limit = { state: "delayed", clause: "C5" };
      else out.limit = { state: "within", clause: st === "D3" ? "C6" : "C5" };
    }
    if (out.limit.clause) out.clauses.push(out.limit.clause);
    return out;
  }

  // ------------------------------------------------------------------ tool definitions
  const REASONS = ["damaged", "items_missing", "lost", "rejected", "address_change_not_shipped", "delivery_date_change",
    "delivered_not_received", "wrong_parcel", "marked_unavailable_home", "rider_conduct", "self_collection", "pickup_not_collected", "delivery_instruction",
    "customer_asks_for_person", "no_clause", "no_progress"];
  const LANG = { type: "string", enum: ["en", "ms", "zh"], description: "The customer's language: en English, ms Malay, zh Mandarin (S30). Default en." };
  const TN = { type: "string", description: "The tracking number exactly as the customer gave it, for example CE26000101. Never guess or complete one." };

  const TOOLS = {
    get_shipment_status: {
      description: "The latest shipment status on the tracking number alone (S4): status, last scan time and location, every scan, expected delivery date (C4), attempts, reattempt date or last collection day (C9), and the limit state (C5, C6, C7, C15). Past a delay or failed-delivery limit the parcel is flagged to the named Logistics Officer in code (S20, S20a), and the result carries the flag sentence to show the customer. Returns no personal field. Call it first for any question about a parcel.",
      input_schema: { type: "object", properties: { tracking_number: TN, language: LANG }, required: ["tracking_number"] },
    },
    verify_customer: {
      description: "Checks the phone number the customer gives against the phone on the parcel (sender or recipient) and, on a match, opens that parcel's personal details and cases for this chat (S4). Three numbers that do not match lock the chat for that tracking number (S6).",
      input_schema: { type: "object", properties: { tracking_number: TN, phone: { type: "string", description: "The phone number exactly as the customer typed it." }, language: LANG }, required: ["tracking_number", "phone"] },
    },
    get_parcel_details: {
      description: "Recipient name, delivery address, contents and proof of delivery (C10). Only after verify_customer matched for this tracking number in this chat (S4).",
      input_schema: { type: "object", properties: { tracking_number: TN, language: LANG }, required: ["tracking_number"] },
    },
    escalate_case: {
      description: "Hands the case to a person with a structured handover (S26) for one of the 16 fixed reasons (S10 to S24). Code checks the reason against the record and picks the kind, the location and the person (S20a); you never choose them. Needs verify_customer first, except customer_asks_for_person (S21). Returns the approved two-sentence reply for the customer (S27); the officer and route stay in the handover note.",
      input_schema: { type: "object", properties: {
        tracking_number: Object.assign({}, TN, { description: TN.description + " Optional only for customer_asks_for_person." }),
        reason: { type: "string", enum: REASONS, description: "damaged (S10), items_missing (S11), lost (S12), rejected (S13), address_change_not_shipped (S14), delivery_date_change (S15), delivered_not_received (S16), wrong_parcel (S17), marked_unavailable_home (S18), rider_conduct: rude rider or parcel left unattended (S19), self_collection (S20b), pickup_not_collected: a booked parcel the rider has not collected yet (S20c), delivery_instruction: an instruction for the rider such as the guardhouse or a neighbour (S20d), customer_asks_for_person (S21), no_clause: no clause covers it or an exception (S23), no_progress: the record does not answer the question (S24)." },
        told_customer: { type: "string", description: "What you have already told the customer in this chat, in one or two sentences." },
        summary: { type: "string", description: "Only what the customer said, in their own terms, in one or two sentences, with anything they reported (for example the new address, the instruction, or what was missing). No status, scan, date or other fact from the parcel record: the handover note shows the record separately (S26)." },
        language: LANG,
      }, required: ["reason", "told_customer", "summary"] },
    },
  };

  // ------------------------------------------------------------------ the desk
  /**
   * createDesk(store, tables, staff, { now }) -> { TOOLS, newSession, call, statusOf, route }
   *   store: { get(name), set(name, value) } over "parcels" and "handovers"
   *   call(session, name, input) -> Promise<{ result }>; every call is logged in session.events
   */
  function createDesk(store, tables, staff, opts) {
    opts = opts || {};
    const now = opts.now || tables.today;
    const L = tables.limits;
    const officers = Object.fromEntries(staff.logistics.map((o) => [o.location, o]));
    const lead = staff.customer_service[0];
    const find = (tn) => store.get("parcels").find((p) => p.tracking_number === String(tn || "").trim().toUpperCase());

    const person = (who) => who.location ? { id: who.id, name: who.name, title: who.title, place: who.location } : { id: who.id, name: who.name, title: who.title, place: who.base };
    /** Approved customer wording for a handover reason or a flag, in the customer's language (S20, S27, S30). */
    function sentence(group, key, who, lang, parcel) {
      const set = tables.sentences[group][key];
      return fill(set[lang] || set.en, { place: who.place, lead: lead.name, destination: parcel ? parcel.delivery_location : "" });
    }
    const wf = (key, v) => fill(tables.workflow[key], Object.assign({ lead: lead.name }, v || {}));
    /** The route, in code (S10 to S20b, S20a). */
    function route(rule, parcel) {
      if (rule.route === "cs") return person(lead);
      const loc = rule.route === "last_scan_location" ? parcel.scans[parcel.scans.length - 1].location : rule.route === "origin" ? parcel.origin : parcel.delivery_location;
      const o = officers[loc];
      if (!o) throw new Error(`No Logistics Officer for ${loc} (C3a)`);
      return person(o);
    }
    const TICKET = { damaged: "damaged", items_missing: "damaged", lost: "lost", rejected: "rejected" };
    /** What the record confirms, in one line; anything the record does not hold is marked so (S26). */
    function recordLine(p, s) {
      if (!p) return "No parcel named in the chat.";
      const parts = [`${s.status.name}`, `last scan ${s.last_scan.status}, ${s.last_scan.location}, ${s.last_scan.at_label}`];
      if (s.last_scan.reason) parts.push(`reason recorded: ${s.last_scan.reason}`);
      parts.push(`delivery attempts: ${s.attempts}`);
      parts.push(`delivery location: ${p.delivery_location}`);
      parts.push(p.pod ? `proof of delivery: ${p.pod.kind}, ${p.pod.location}, ${label(p.pod.at)}, ${p.pod.detail}` : "proof of delivery: not recorded");
      return parts.join("; ") + ".";
    }
    function action(kindKey, reason, who) {
      if (kindKey === "transfer") return `Review the handoff and transfer to ${who.name} for investigation.`;
      if (TICKET[reason]) return `Register a ticket of type ${TICKET[reason]} (S28, C14), then close with a note.`;
      return "Take the chat: reply to the customer, then close with a note.";
    }
    /** The S26 note in the reply guide's labelled fields, written from the stored handover. */
    function noteOf(h) {
      return {
        "Customer and tracking number": `${h.customer} · ${h.tracking_number || "No tracking number given"}`,
        "Reason and lane": `${h.reason} · ${h.kind_label}`,
        "Customer report": h.customer_report || "Not recorded.",
        "Verification": h.verification,
        "Record": h.record,
        "Told customer": h.told_customer ? `"${h.told_customer}"` : "Not recorded yet.",
        "Recommended action": h.recommended_action,
        "Assigned officer and location": `${h.to.name} · ${h.to.title} · ${h.to.place}`,
        "Workflow state": h.workflow_state + (h.staff_notes && h.staff_notes.length ? ` Staff note: ${h.staff_notes[h.staff_notes.length - 1]}` : ""),
      };
    }
    function addHandover(h) {
      const list = store.get("handovers").slice();
      h.id = `H-${String(list.length + 1).padStart(4, "0")}`;
      h.state = "queued";
      h.workflow_state = wf(`queued_${h.kind}`);
      h.staff_notes = [];
      list.push(h);
      store.set("handovers", list);
      return h;
    }
    function saveHandover(h) {
      store.set("handovers", store.get("handovers").map((x) => (x.id === h.id ? h : x)));
    }

    const ok = (tool, data, next) => ({ tool, status: "ok", data, error: null, next_step: next || null });
    const refuse = (tool, code, clause, message, next) => ({ tool, status: "refused", data: null, error: { code, clause, message }, next_step: next || null });
    const lang = (input) => (["en", "ms", "zh"].includes(input.language) ? input.language : "en");

    function notFound(tool, tn) {
      return refuse(tool, "not_found", "Delivery Status Guide", `No parcel matches tracking number ${tn}.`,
        { do: "Tell the customer no parcel matches that number and ask them to check it. Never guess a near match." });
    }
    function lockedResult(tool, tn, input) {
      return refuse(tool, "locked", "S6", `The chat is locked for ${tn} after ${L.phone_failures_to_lock} phone numbers that did not match.`,
        { say: sentence_fixed("locked", lang(input)) + "\nClause: S6" });
    }
    const sentence_fixed = (k, l) => tables.sentences[k][l] || tables.sentences[k].en;
    const verifiedName = (p, as) => `${p[as].name} (${as})`;

    const IMPL = {
      get_shipment_status(session, input) {
        const p = find(input.tracking_number);
        if (!p) return notFound("get_shipment_status", input.tracking_number);
        const s = statusOf(p, now, tables);
        let next = null;
        if (s.limit.state === "delayed" || s.limit.state === "failed") {
          const reason = s.limit.state === "delayed" ? "delay" : "failed_delivery";
          const rule = tables.flags[reason];
          const who = route(rule, p);
          const existing = store.get("handovers").find((h) => h.raised_by === "code" && h.tracking_number === p.tracking_number && h.reason === reason);
          const say = sentence("flag", reason, who, lang(input));
          const tn = p.tracking_number;
          const h = existing || addHandover({
            at: tables.today, conversation: session.id, raised_by: "code", tracking_number: tn, reason,
            kind: rule.kind, kind_label: tables.kinds[rule.kind], clauses: rule.clauses.concat([s.limit.clause]).filter((x, i, a) => a.indexOf(x) === i),
            to: who, customer: session.verified[tn] ? verifiedName(p, session.verified[tn]) : "Customer not identified",
            customer_report: session.last_message || "Not recorded.",
            verification: session.verified[tn] ? `Phone matched for this parcel in this chat (${session.verified[tn]}).` : "Not verified; flag raised by code from the record (S4, S20).",
            record: recordLine(p, s) + (s.limit.state === "delayed" ? ` ${s.hours_since_last_scan} hours since the last scan, past the ${s.limit.clause === "C6" ? "48-hour hub" : "3-day scan"} limit (${s.limit.clause}).` : " No delivery scan by 9 pm (C7)."),
            told_customer: null, customer_sentence: say,
            recommended_action: action("transfer", reason, who),
          });
          s.flag = { reason, clause: s.limit.clause, sentence: say, handover: h.id, already_flagged: !!existing };
          s.clauses.push("S20");
          next = { do: `Write one short sentence on the latest status in everyday words, then this sentence exactly as it is: "${say}"` };
        } else if (s.limit.state === "lost") {
          next = { do: "The parcel counts as lost (C15). Ask for the phone number on the parcel, then escalate_case with reason lost (S12)." };
        }
        return ok("get_shipment_status", s, next);
      },

      verify_customer(session, input) {
        const tn = String(input.tracking_number || "").trim().toUpperCase();
        const p = find(tn);
        if (!p) return notFound("verify_customer", input.tracking_number);
        if (session.locked[tn]) return lockedResult("verify_customer", tn, input);
        if (session.verified[tn]) return ok("verify_customer", { verified: true, tracking_number: tn, as: session.verified[tn] });
        const d = digits(input.phone);
        const as = d && d === digits(p.recipient.phone) ? "recipient" : d && d === digits(p.sender.phone) ? "sender" : null;
        if (as) { session.verified[tn] = as; return ok("verify_customer", { verified: true, tracking_number: tn, as }); }
        session.fails[tn] = (session.fails[tn] || 0) + 1;
        if (session.fails[tn] >= L.phone_failures_to_lock) { session.locked[tn] = true; return lockedResult("verify_customer", tn, input); }
        return refuse("verify_customer", "no_match", "S4", `That phone number does not match the parcel. ${L.phone_failures_to_lock - session.fails[tn]} tries left.`,
          { do: "Tell the customer the number does not match and ask them to check it. Never say which number is on the parcel." });
      },

      get_parcel_details(session, input) {
        const tn = String(input.tracking_number || "").trim().toUpperCase();
        const p = find(tn);
        if (!p) return notFound("get_parcel_details", input.tracking_number);
        if (session.locked[tn]) return lockedResult("get_parcel_details", tn, input);
        if (!session.verified[tn]) return refuse("get_parcel_details", "not_verified", "S4", "Personal details need the phone number on the parcel to match first.",
          { do: "Ask for the phone number on the parcel, then call verify_customer.", say: sentence_fixed("not_verified", lang(input)) + "\nClause: S4" });
        const d = { tracking_number: tn, recipient_name: p.recipient.name, delivery_address: p.recipient.address, contents: p.contents };
        if (p.pod) d.proof_of_delivery = { at: label(p.pod.at), location: p.pod.location, kind: p.pod.kind, detail: p.pod.detail };
        return ok("get_parcel_details", d);
      },

      escalate_case(session, input) {
        const reason = input.reason;
        const rule = tables.reasons[reason];
        if (!rule) return refuse("escalate_case", "invalid_reason", "S9", `${reason} is not one of the 16 fixed reasons.`, { do: "Pick a fixed reason, or answer or decline instead (S7, S8)." });
        const tn = String(input.tracking_number || "").trim().toUpperCase();
        const p = tn ? find(tn) : null;
        if (tn && !p) return notFound("escalate_case", input.tracking_number);
        if (reason !== "customer_asks_for_person") {
          if (!p) return refuse("escalate_case", "missing_details", "S26", "A tracking number is needed for this reason.", { do: "Ask the customer for the tracking number." });
          if (session.locked[tn]) return lockedResult("escalate_case", tn, input);
          if (!session.verified[tn]) return refuse("escalate_case", "not_verified", "S4", "A case the customer asks to open needs the phone number on the parcel to match first.",
            { do: "Ask for the phone number on the parcel, then call verify_customer, then escalate_case again." });
        }
        const s = p ? statusOf(p, now, tables) : null;
        // The reason checked against the record.
        if (reason === "lost" && s.limit.state !== "lost")
          return refuse("escalate_case", "not_lost", "C15", `Not lost: the last scan was ${s.hours_since_last_scan} hours ago (${s.last_scan.status}, ${s.last_scan.location}, ${s.last_scan.at_label}), within 7 days.`,
            { do: "Politely advise the parcel is not missing and is on its way, with its last scan (C15). No handover." });
        if (reason === "address_change_not_shipped" && s.shipped)
          return refuse("escalate_case", "already_shipped", "C12", `The parcel is already shipped (${s.status.name}), so the address cannot be changed.`,
            { do: "Politely decline: the address cannot be changed once the parcel is shipped (C12). No handover." });
        if (reason === "pickup_not_collected" && s.shipped)
          return refuse("escalate_case", "already_picked_up", "C2", `The parcel was already picked up; its status is ${s.status.name}.`, { do: "Advise the latest status instead." });
        if (reason === "delivery_instruction" && ["D7", "D8"].includes(s.status.id))
          return refuse("escalate_case", "already_delivered", "C19", `The parcel is no longer out for delivery; its status is ${s.status.name}.`, { do: "Advise the latest status instead." });
        if (reason === "delivered_not_received" && s.status.id !== "D7")
          return refuse("escalate_case", "not_delivered", "C10", `The parcel is not delivered; its status is ${s.status.name}.`, { do: "Advise the latest status instead." });
        if (reason === "rejected" && s.status.id !== "D8")
          return refuse("escalate_case", "not_rejected", "C14", `The parcel was not rejected; its status is ${s.status.name}.`, { do: "Advise the latest status instead." });
        const missing = ["told_customer", "summary"].filter((k) => typeof input[k] !== "string" || input[k].trim().length < 3);
        if (missing.length) return refuse("escalate_case", "missing_details", "S26", `The handover needs ${missing.join(" and ")}.`, { do: "Call escalate_case again with every S26 field." });

        const who = route(rule, p);
        const say = sentence("handover", reason, who, lang(input), p);
        const dup = store.get("handovers").find((h) => h.raised_by === "agent" && h.reason === reason && h.tracking_number === (p ? p.tracking_number : null) && h.conversation === session.id);
        const as = p && session.verified[tn];
        const h = dup || addHandover({
          at: tables.today, conversation: session.id, raised_by: "agent", tracking_number: p ? p.tracking_number : null, reason,
          kind: rule.kind, kind_label: tables.kinds[rule.kind], clauses: rule.clauses, to: who,
          customer: as ? verifiedName(p, as) : "Customer not identified",
          customer_report: input.summary.trim(), agent_told: input.told_customer.trim(),
          verification: as ? `Phone ${mask(p[as].phone)} matched for this parcel in this chat (${as}).` : session.locked[tn] ? "Locked after three phone numbers that did not match (S6)." : "Not verified; the customer asked for a person (S21).",
          record: recordLine(p, s), told_customer: null, customer_sentence: say,
          recommended_action: action(rule.kind, reason, who),
        });
        // The customer is told the approved wording; the note keeps the officer, title and route (S27).
        return ok("escalate_case", { handover: h.id, reason, lane: tables.kinds[rule.kind], duplicate: !!dup },
          { say: say + "\nClause: " + rule.clauses.join(", ") });
      },
    };

    function newSession(id) {
      return { id: id || `chat-${Math.random().toString(36).slice(2, 8)}`, verified: {}, fails: {}, locked: {}, events: [], last_message: null };
    }

    /** After a turn: the reply as sent becomes "Told customer" on this chat's new handovers (S26). */
    function recordReply(session, reply) {
      const text = String(reply || "").replace(/\n\s*Clause:[^\n]*$/, "").trim();
      for (const h of store.get("handovers")) {
        if (h.conversation === session.id && h.told_customer === null) { h.told_customer = text; saveHandover(h); }
      }
    }

    /**
     * Nurul Aina's actions on the staff page (S2, S28). Not offered to the AI. The workflow state changes only when
     * the action succeeds; every action needs a staff note.
     *   register_ticket  CS resolves, queued -> ticket_registered (ticket type from C14)
     *   close            CS resolves after the ticket, or a To CS chat -> closed
     *   transfer         Transfer, queued -> transferred to the officer code named
     */
    function staffAction(id, act, note) {
      const h = store.get("handovers").find((x) => x.id === id);
      const no = (code, message) => ({ status: "refused", error: { code, message } });
      if (!h) return no("not_found", `No handover ${id}.`);
      if (!note || String(note).trim().length < 3) return no("note_required", "Add a staff note first.");
      if (h.state === "closed" || h.state === "transferred") return no("already_done", `This handover is already ${h.state}.`);
      if (act === "register_ticket") {
        if (h.kind !== "cs_resolves" || !TICKET[h.reason]) return no("wrong_lane", "Only a CS resolves case for damaged, items missing, lost or rejected takes a ticket (C14).");
        if (h.state !== "queued") return no("already_registered", "The ticket is already registered.");
        const n = store.get("handovers").filter((x) => x.ticket).length + 1;
        h.ticket = `TK-${TICKET[h.reason].toUpperCase()}-${String(n).padStart(4, "0")}`;
        h.state = "ticket_registered";
        h.workflow_state = wf("ticket_registered", { ticket: h.ticket });
      } else if (act === "close") {
        if (h.kind === "transfer") return no("wrong_lane", "A Transfer case is transferred, not closed here.");
        if (h.kind === "cs_resolves" && h.state !== "ticket_registered") return no("ticket_first", "Register the ticket before closing (S28).");
        h.state = "closed";
        h.workflow_state = wf("closed");
      } else if (act === "transfer") {
        if (h.kind !== "transfer") return no("wrong_lane", "Only a Transfer case goes to a Logistics Officer.");
        h.state = "transferred";
        h.workflow_state = wf("transferred", { name: h.to.name, title: h.to.title, place: h.to.place });
      } else return no("unknown_action", `${act} is not a staff action.`);
      h.staff_notes = (h.staff_notes || []).concat([String(note).trim()]);
      saveHandover(h);
      return { status: "ok", handover: h };
    }

    async function call(session, name, input) {
      const t0 = Date.now();
      input = input || {};
      let result;
      if (!IMPL[name]) result = refuse(name, "unknown_tool", "S3", `${name} is not a tool here.`);
      else {
        try { result = IMPL[name](session, input); }
        catch (e) { result = { tool: name, status: "error", data: null, error: { code: "internal", clause: null, message: String(e.message || e) }, next_step: null }; }
      }
      result.elapsed_ms = Date.now() - t0;
      session.events.push({ tool: name, input, result, at: session.events.length });
      return { result };
    }

    return { TOOLS, newSession, call, recordReply, staffAction, noteOf, statusOf: (p) => statusOf(p, now, tables), route, find };
  }

  return { createDesk, memoryStore, statusOf, calendar, label, dateLabel, digits, TOOLS, REASONS };
});
