/* Policy calculations written once and used by the back end, both hooks, the generator checks and
 * the tests. Reads the tables in resources/policy_tables.json, never a copy.
 *   who a staff ID is (CP-02); age in completed months and years, the age band and the band doctor (CL-01);
 *   vaccination status from the Immunisation Schedule (CL-13, IS section 7);
 *   sessions, the rota, holidays and free slots (OP-03, OP-06); the prescription checks against the
 *   Clinic Formulary (CL-07 to CL-09); the supplied quantity (Fee Schedule section 4); invoice balance (BP-03).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./format.js"));
  else root.SKRules = factory(root.SKFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const toDay = (iso) => Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000);
  const fromDay = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const addDays = (iso, n) => fromDay(toDay(iso) + n);
  const daysBetween = (a, b) => toDay(b) - toDay(a);
  const weekday = (iso) => WD[new Date(iso + "T00:00:00Z").getUTCDay()];
  const minutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

  /** Add calendar months, clamping to the last day of the target month (IS section 7). */
  function addMonths(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  }
  /** Completed months and years at a date (CL-01). */
  function ageAt(dob, iso) {
    const [y1, m1, d1] = dob.split("-").map(Number), [y2, m2, d2] = iso.split("-").map(Number);
    const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
    return { months, years: Math.floor(months / 12) };
  }
  function ageLabel(dob, iso) {
    const a = ageAt(dob, iso);
    return a.years < 1 ? `${a.months} months` : `${a.years}`;
  }

  function createRules(tables) {
    const V = tables.values;
    const staffById = Object.fromEntries(tables.staff.map((s) => [s.id, s]));
    const P = tables.presentations, PROF = tables.profiles;

    /** CP-01, CP-02: only the staff registry counts; a typed ID is never looked up here. */
    function who(id) { return staffById[id] || null; }
    /** The named person for next_step (D3). */
    function person(id, clause, extra) {
      const s = staffById[id];
      return Object.assign({ person: s.name, job_title: s.title, staff_id: s.id, clause: clause || null, request_id: null }, extra || {});
    }

    function band(dob, iso) {
      const y = ageAt(dob, iso).years;
      for (const [k, b] of Object.entries(tables.bands)) if (y >= b.min_years && y <= b.max_years) return k;
      return y >= 18 ? "adult" : null;
    }
    const bandDoctor = (b) => (tables.bands[b] ? tables.bands[b].doctor : null);
    /** Band change ahead (CL-01, CL-03): the next birthday that moves the patient to another band. */
    function bandChange(dob, today) {
      const now = band(dob, today);
      const y = ageAt(dob, today).years;
      const next = addMonths(dob, (y + 1) * 12);
      const after = band(dob, next);
      return after !== now ? { on: next, from: now, to: after, days: daysBetween(today, next) } : null;
    }

    // ---------------------------------------------------------------- vaccination status (CL-13)
    function vaccineStatus(patient, admins, today) {
      const age = ageAt(patient.dob, today);
      return tables.immunisation.map((row) => {
        const done = admins.find((a) => a.schedule_id === row.id && a.verified);
        const out = { schedule_id: row.id, vaccine: row.name, dose: row.dose, target: null, status: null };
        if (/programme only/.test(row.channel)) {
          if (!(patient.region && row.channel.toLowerCase().includes(patient.region.toLowerCase()))) { out.status = "NOT_APPLICABLE"; return out; }
        }
        if (done) { out.status = "COMPLETED_RECORDED"; out.given = done.date; out.source = done.source; return out; }
        const m = row.target.match(/^(\d+) months$/);
        if (row.target === "birth" || m) {
          out.target = row.target === "birth" ? patient.dob : addMonths(patient.dob, Number(m[1]));
          if (out.target > today) out.status = "NOT_YET_DUE";
          else if (!patient.history_complete) out.status = "HISTORY_UNVERIFIED";
          else if (out.target === today) out.status = "DUE_TODAY";
          else { out.status = "PAST_TARGET_REVIEW"; out.days_past_target = daysBetween(out.target, today); }
          return out;
        }
        const c = row.target.match(/age (\d+)/);
        const cohort = c ? Number(c[1]) : null;
        if (/girls/.test(row.target) && patient.sex !== "F") { out.status = "NOT_APPLICABLE"; return out; }
        if (age.years < cohort) out.status = "NOT_YET_DUE";
        else if (/HPV/.test(row.id) && age.years > cohort) out.status = "PROGRAMME_REVIEW_REQUIRED";
        else out.status = "SCHOOL_PROGRAMME_REVIEW";
        out.cohort = row.target;
        return out;
      });
    }
    const overdue = (rows) => rows.filter((r) => r.status === "PAST_TARGET_REVIEW");

    // ---------------------------------------------------------------- sessions and slots (OP-03, OP-06)
    function session(iso, s) {
      if (iso < tables.rota_valid[0] || iso > tables.rota_valid[1]) return { open: false, gap: true, doctors: [], reason: "outside the rota's valid dates" };
      if (iso in tables.holidays) return { open: false, doctors: [], reason: `public holiday: ${tables.holidays[iso]}` };
      const wd = weekday(iso);
      if (wd === "Sun") return { open: false, doctors: [], reason: "closed on Sunday" };
      if (wd === "Sat") {
        if (s === "PM") return { open: false, doctors: [], reason: "closed on Saturday afternoon" };
        const d = tables.saturday_rota[iso];
        return d ? { open: true, doctors: [d], on_duty: d } : { open: false, gap: true, doctors: [], reason: "no Saturday rota entry" };
      }
      return { open: true, doctors: tables.weekly[wd][s], on_duty: tables.on_duty[s] };
    }
    function busy(appts, doctor, iso) {
      return appts.filter((a) => a.doctor === doctor && a.date === iso && (a.status === "pending" || a.status === "confirmed"))
        .map((a) => [minutes(a.start), minutes(a.start) + a.minutes]);
    }
    /** Free start times for a visit of `len` minutes in one session. */
    function freeStarts(doctor, iso, s, len, appts) {
      const si = session(iso, s);
      if (!si.open || !si.doctors.includes(doctor)) return [];
      const [from, to] = tables.sessions[s].map(minutes);
      const taken = busy(appts, doctor, iso);
      const out = [];
      for (let t = from; t + len <= to; t += tables.grid_minutes) {
        if (!taken.some(([a, b]) => t < b && a < t + len)) out.push(hhmm(t));
      }
      return out;
    }
    /** The doctor's next sessions with a free slot, from a date (inclusive). */
    function nextSessions(doctor, fromIso, len, appts, n) {
      const out = [];
      for (let i = 0; i < 70 && out.length < (n || 3); i++) {
        const iso = addDays(fromIso, i);
        for (const s of ["AM", "PM"]) {
          const free = freeStarts(doctor, iso, s, len, appts);
          if (free.length && out.length < (n || 3)) out.push({ date: iso, session: s, time: free[0], label: F.when(iso, free[0]) });
        }
      }
      return out;
    }

    // ---------------------------------------------------------------- prescriptions (CL-07 to CL-09)
    const fail = (code, message, values) => ({ ok: false, code, message, values: values || null });
    const num = (s) => { const m = String(s || "").match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

    /** The exact presentation from the medicine, the stated strength and the dose unit; never guessed (CL-07). */
    function presentation(line) {
      const med = String(line.medicine || "").trim().toLowerCase();
      const cands = Object.values(P).filter((p) => p.generic.toLowerCase().startsWith(med) && med.length >= 4);
      if (!cands.length) return fail("FORMULARY_NOT_FOUND", `${line.medicine} is not in the Clinic Formulary.`);
      let pick = cands;
      if (cands.length > 1) {
        const want = num(line.strength);
        pick = want === null ? [] : cands.filter((p) => num(p.strength) === want);
        if (pick.length !== 1 && line.dose_unit) pick = (want === null ? cands : pick).filter((p) => p.dose_unit === line.dose_unit);
        if (pick.length !== 1) return fail("STRENGTH_AMBIGUOUS", `${cands[0].generic} comes in ${cands.map((p) => p.strength.split(" = ")[0]).join(" and ")}; the exact strength was not given.`);
      } else if (line.strength && num(line.strength) !== null && num(line.strength) !== num(pick[0].strength)) {
        return fail("STRENGTH_AMBIGUOUS", `${pick[0].generic} is stocked only as ${pick[0].strength}; ${line.strength} does not match.`);
      }
      return { ok: true, p: pick[0] };
    }

    function profileFor(p, ageMonths, indication) {
      const g = p.generic.toLowerCase();
      if (g === "cetirizine hydrochloride") {
        const id = ageMonths < 72 ? "CF-CET-2TO5" : ageMonths < 144 ? "CF-CET-6TO11" : "CF-CET-12TO17";
        return id;
      }
      return { paracetamol: "CF-PAR-01", amoxicillin: "CF-AMX-GAS-BID", salbutamol: "CF-SAL-ROUTINE", hydrocortisone: "CF-HC-MANUAL" }[g];
    }

    /**
     * checkLine(line, ctx): ctx { ageMonths, weight: { kg, date } | null, today, allergyStatus ("nka"|"recorded"|"unknown"),
     *   allergies: [{ substance, class }], indication, others: [presentation ids already on this prescription] }
     * Returns { ok, code, message, values } or { ok: true, presentation, profile, mg_per_dose, mg_per_day, supply }.
     */
    function checkLine(line, ctx) {
      const r = presentation(line);
      if (!r.ok) return r;
      const p = r.p;
      const pid = profileFor(p, ctx.ageMonths, ctx.indication);
      const prof = PROF[pid];
      if (prof.manual) return fail("CLINICIAN_REVIEW_REQUIRED", "Hydrocortisone cream has no approved automatic profile; a clinician-approved profile is needed before it is recorded.", { profile: pid });
      if (!prof.presentations.includes(p.id)) return fail("PROFILE_NOT_SUPPORTED", `${p.id} is not supported by ${pid} at this age.`, { profile: pid });
      if (ctx.ageMonths < prof.age_min_months || ctx.ageMonths > prof.age_max_months)
        return fail("PROFILE_NOT_SUPPORTED", `${pid} covers ages ${prof.age_min_months} to ${prof.age_max_months} months; the patient is ${ctx.ageMonths} months.`, { profile: pid, age_months: ctx.ageMonths });
      if (prof.indication && ctx.indication !== prof.indication)
        return fail("PROFILE_NOT_SUPPORTED", `${pid} needs a doctor-recorded confirmed GAS indication on this visit; none is recorded.`, { profile: pid, indication: ctx.indication || null });
      // CL-09: allergy status must be explicit; a recorded match blocks.
      if (ctx.allergyStatus !== "nka" && ctx.allergyStatus !== "recorded") return fail("ALLERGY_REVIEW_REQUIRED", "Allergy status is not recorded; an empty list is not proof of no allergies.", { allergy_status: ctx.allergyStatus || "unknown" });
      for (const a of ctx.allergies || []) {
        if (!a.class && !a.substance) return fail("ALLERGY_REVIEW_REQUIRED", "A free-text allergy has no ingredient or class mapping.");
        const hit = p.allergy.find((x) => [a.substance, a.class].filter(Boolean).some((y) => x.toLowerCase().includes(String(y).toLowerCase())));
        if (hit) return fail("ALLERGY_REVIEW_REQUIRED", `Recorded ${a.class || a.substance} allergy matches ${p.generic} (${hit}).`, { allergy: a.class || a.substance, medicine: p.generic });
        if (/review/.test(p.allergy.join(" ")) && a.class && p.allergy.some((x) => x.includes(a.class))) return fail("ALLERGY_REVIEW_REQUIRED", `A recorded ${a.class} allergy needs clinical review.`);
      }
      if ((ctx.others || []).some((o) => P[o] && P[o].generic === p.generic)) return fail("DUPLICATE_INGREDIENT", `${p.generic} is already on this prescription.`);
      if (line.dose_unit && line.dose_unit !== p.dose_unit) return fail("STRENGTH_AMBIGUOUS", `${p.id} is dosed in ${p.dose_unit}, not ${line.dose_unit}.`);
      // CL-08: weight, when the profile requires it.
      let w = null;
      if (prof.weight_required) {
        if (!ctx.weight) return fail("WEIGHT_STALE", "No recorded weight; a weight within 30 days is required.", { limit_days: V.weight_max_days });
        const age = daysBetween(ctx.weight.date, ctx.today);
        if (age < 0 || age > V.weight_max_days || !(ctx.weight.kg > 0))
          return fail("WEIGHT_STALE", `The last weight, ${ctx.weight.kg} kg on ${F.dayLabel(ctx.weight.date)}, is ${age} days old; the limit is ${V.weight_max_days} days.`, { weight_kg: ctx.weight.kg, weighed: ctx.weight.date, days_old: age, limit_days: V.weight_max_days });
        w = ctx.weight.kg;
        if (prof.weight_max_kg && w > prof.weight_max_kg) return fail("PROFILE_NOT_SUPPORTED", `${pid} covers weights up to ${prof.weight_max_kg} kg.`, { weight_kg: w });
      }
      const amount = Number(line.amount_per_dose), times = Number(line.times_per_day), days = Number(line.duration_days);
      // Frequency and duration
      if (prof.doses_day_exact && times !== prof.doses_day_exact) return fail("FREQUENCY_INVALID", `${pid} allows exactly ${prof.doses_day_exact} dose${prof.doses_day_exact > 1 ? "s" : ""} a day; ${times} entered.`, { entered: times, allowed: prof.doses_day_exact });
      if (prof.max_doses_day && (!(times >= 1) || times > prof.max_doses_day)) return fail("FREQUENCY_INVALID", `${pid} allows at most ${prof.max_doses_day} doses in 24 hours; ${times} entered.`, { entered: times, allowed_max: prof.max_doses_day });
      if (prof.max_occasions_day && (!(times >= 1) || times > prof.max_occasions_day)) return fail("FREQUENCY_INVALID", `${pid} allows at most ${prof.max_occasions_day} occasions in 24 hours.`, { entered: times });
      if (prof.duration_exact && days !== prof.duration_exact) return fail("DURATION_INVALID", `${pid} needs exactly ${prof.duration_exact} days; ${days} entered.`, { entered: days, allowed: prof.duration_exact });
      if (prof.duration && !(days >= prof.duration[0] && days <= prof.duration[1])) return fail("DURATION_INVALID", `${pid} allows ${prof.duration[0]} to ${prof.duration[1]} days; ${days} entered.`, { entered: days, allowed: prof.duration });
      // Dose
      const mg = p.mg_per_unit === null ? null : amount * p.mg_per_unit;
      const vals = { amount_per_dose: `${amount} ${p.dose_unit}`, mg_per_dose: mg, mg_per_day: mg === null ? null : mg * times, weight_kg: w };
      if (pid === "CF-PAR-01") {
        const perKg = mg / w, perKgDay = (mg * times) / w;
        Object.assign(vals, { mg_per_kg_dose: +perKg.toFixed(2), mg_per_kg_day: +perKgDay.toFixed(2), allowed_mg_per_kg_dose: prof.mg_per_kg_dose, max_mg_per_kg_day: prof.max_mg_per_kg_day });
        if (perKg < prof.mg_per_kg_dose[0] || perKg > prof.mg_per_kg_dose[1] || perKgDay > prof.max_mg_per_kg_day)
          return fail("DOSE_OUTSIDE_PROFILE", `${mg} mg a dose is ${vals.mg_per_kg_dose} mg/kg (allowed 10 to 15 mg/kg, at most 60 mg/kg a day).`, vals);
      } else if (pid === "CF-AMX-GAS-BID") {
        const expected = Math.min(prof.mg_per_kg_dose_target * w, prof.cap_mg_dose);
        Object.assign(vals, { expected_mg_per_dose: expected, tolerance_pct: prof.tolerance_pct, cap_mg_dose: prof.cap_mg_dose, cap_mg_day: prof.cap_mg_day });
        const off = Math.abs(mg - expected) / expected * 100;
        const failed = [];
        if (off > prof.tolerance_pct) failed.push(`${mg} mg a dose is not the ${expected} mg target (25 mg/kg at ${w} kg, within 2%)`);
        if (mg > prof.cap_mg_dose) failed.push(`above the ${prof.cap_mg_dose} mg a dose cap`);
        if (mg * times > prof.cap_mg_day) failed.push(`${mg * times} mg a day is above the ${prof.cap_mg_day} mg a day cap`);
        if (failed.length) return fail("DOSE_OUTSIDE_PROFILE", failed.join("; ") + ".", Object.assign(vals, { failed }));
      } else if (pid.startsWith("CF-CET")) {
        Object.assign(vals, { required_mg_per_dose: prof.mg_dose_exact, max_mg_day: prof.max_mg_day });
        if (Math.abs(mg - prof.mg_dose_exact) > 1e-9 || mg * times > prof.max_mg_day) return fail("DOSE_OUTSIDE_PROFILE", `${pid} needs ${prof.mg_dose_exact} mg a dose, at most ${prof.max_mg_day} mg a day; ${mg} mg entered.`, vals);
      } else if (pid === "CF-SAL-ROUTINE") {
        if (!Number.isInteger(amount) || amount < prof.puffs[0] || amount > prof.puffs[1] || amount * times > prof.max_puffs_day)
          return fail("DOSE_OUTSIDE_PROFILE", `Routine salbutamol is 1 or 2 whole puffs an occasion, at most ${prof.max_puffs_day} puffs in 24 hours.`, vals);
        if (!line.plan_reference || !line.review_date || !line.supply_quantity) return fail("PROFILE_NOT_SUPPORTED", "A routine salbutamol line needs the plan reference, a review date and the supply quantity.", vals);
        if (daysBetween(ctx.today, line.review_date) > prof.review_max_days) return fail("PROFILE_NOT_SUPPORTED", `The review date must be within ${prof.review_max_days} days.`, vals);
      }
      return { ok: true, presentation: p.id, profile: pid, mg_per_dose: mg, mg_per_day: mg === null ? null : mg * times, values: vals, supply: supply(p, line) };
    }

    /** Whole supplied units (Fee Schedule section 4): liquids by course volume, tablets by count, inhalers as stated. */
    function supply(p, line) {
      if (line.supply_quantity) return { qty: Number(line.supply_quantity), unit: p.stocked };
      if (p.dose_unit === "mL" && p.stocked_volume_ml) {
        const vol = Number(line.amount_per_dose) * Number(line.times_per_day) * Number(line.duration_days);
        return { qty: Math.ceil(vol / p.stocked_volume_ml), unit: `${p.stocked_volume_ml} mL bottle`, volume_ml: vol };
      }
      if (p.dose_unit === "tablet") return { qty: Number(line.amount_per_dose) * Number(line.times_per_day) * Number(line.duration_days), unit: "tablet" };
      return { qty: 1, unit: p.stocked };
    }

    /** BP-03: outstanding = charges - adjustments - payments, in sen. */
    function invoiceBalance(inv, payments) {
      const charges = inv.lines.reduce((a, l) => a + l.sen * l.qty, 0);
      const adj = (inv.adjustments || []).reduce((a, x) => a + x.sen, 0);
      const paid = payments.filter((x) => x.invoice === inv.id).reduce((a, x) => a + x.sen, 0);
      return { charges, adjustments: adj, paid, outstanding: charges - adj - paid };
    }

    return { V, tables, who, person, ageAt, ageLabel, band, bandDoctor, bandChange, addMonths, addDays, daysBetween, weekday,
      vaccineStatus, overdue, session, freeStarts, nextSessions, presentation, checkLine, supply, invoiceBalance, minutes, hhmm };
  }

  return { createRules, ageAt, addMonths };
});
