/* The back end data layer: the order data behind the lookups and requests.
 *
 * Each lookup returns only its department's fields (tables.field_sets), enforced here before any data
 * leaves; PostToolUse checks again. Working days skip weekends and the Selangor holidays. The windows
 * (FP2 delivery, RP1 return, QP1 report, QP2 warranty) and the campaign day, threshold and fee due
 * (MP1, MP2, MP3) are computed here. The critical checks (order access, item in order, the windows,
 * not dispatched) are repeated here, so a hook is a second line, not the only one.
 * A back-end refusal throws { backend: true, code, message }; a fault (benchmark) throws lookup_timeout.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./format.js"));
  else root.HMBackend = factory(root.HMFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  function refuse(code, message) {
    const e = new Error(message);
    e.backend = true; e.code = code;
    throw e;
  }

  function createRules(tables) {
    const V = tables.values;
    const isWorking = (iso) => {
      const wd = new Date(iso + "T00:00:00Z").getUTCDay();
      return wd >= 1 && wd <= 5 && !(iso in tables.holidays);
    };
    const addDay = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
    /** The n-th working day after a date (the date itself not counted). */
    function nthWorkingDayAfter(iso, n) {
      let d = iso, k = 0;
      while (k < n) { d = addDay(d, 1); if (isWorking(d)) k++; }
      return d;
    }
    /** FP2: delivered within 3 to 5 working days of the order date. */
    function deliveryWindow(orderUnix) {
      const day = F.mytDate(orderUnix);
      return { from: nthWorkingDayAfter(day, 3), to: nthWorkingDayAfter(day, 5) };
    }
    /** Calendar days in Malaysia time between two moments, as RP1 and QP2 count them. */
    function daysBetween(fromUnix, toUnix) {
      return Math.round((Date.parse(F.mytDate(toUnix) + "T00:00:00Z") - Date.parse(F.mytDate(fromUnix) + "T00:00:00Z")) / 86400000);
    }
    /** MP1, MP2, MP3: campaign day, threshold and fee due for an order. */
    function feeRule(orderUnix, totalSen) {
      const day = F.mytDate(orderUnix);
      const campaign = tables.campaign_days[day] || null;
      const threshold = campaign ? V.campaign_free_above_sen : V.free_above_sen;
      return { campaign, threshold, fee_due: totalSen > threshold ? 0 : V.standard_fee_sen, clause: campaign ? "MP3" : "MP1" };
    }
    return { V, isWorking, nthWorkingDayAfter, deliveryWindow, daysBetween, feeRule };
  }

  /**
   * createBackend(store, rules, opts): opts.now (Unix seconds), opts.fieldSets (tables.field_sets),
   * opts.faults ({ tool: count } lookups that time out).
   * Every function takes the session's verified order ID; the hooks have already checked it, this checks again.
   */
  function createBackend(store, rules, opts) {
    const now = opts.now;
    const faults = Object.assign({}, opts.faults || {});
    const fields = opts.fieldSets;
    const order = (id) => store.get("orders").find((o) => o.order_id === id) || null;
    const nextId = (name, prefix) => `${prefix}-${String((store.get(name) || []).length + 1).padStart(4, "0")}`;
    function access(verified, orderId, lineId) {
      if (!verified || orderId !== verified) refuse("order_not_verified", `Order ${orderId} is not the verified order.`);
      const o = order(orderId);
      if (!o) refuse("order_not_verified", `No order ${orderId}.`);
      if (lineId !== undefined && !o.lines.some((l) => l.line_id === lineId)) refuse("item_not_in_order", `${lineId} is not a line of ${orderId}.`);
      return o;
    }
    function fault(tool) {
      if (faults[tool] > 0) { faults[tool]--; const e = new Error("The order system did not answer in time."); e.fault = true; e.code = "lookup_timeout"; throw e; }
    }
    function write(name, rec) { store.set(name, (store.get(name) || []).concat([rec])); return rec; }
    const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

    return {
      /** verify_order: CS1. Returns the order ID and the first name only; never says which part failed. */
      verify(orderId, last4) {
        const o = order(orderId);
        const digits = o ? o.phone.replace(/\D/g, "") : "";
        if (!o || digits.slice(-4) !== last4) return null;
        return { order_id: o.order_id, first_name: o.first_name };
      },
      deliveryInfo(verified, orderId) {
        fault("get_delivery_info");
        const o = access(verified, orderId);
        const w = rules.deliveryWindow(o.order_time);
        return pick({ order_id: o.order_id, status: o.status, order_time: o.order_time, dispatch_time: o.dispatch_time,
          delivery_time: o.delivery_time, delivery_address: o.delivery_address, delivery_window: w }, fields.get_delivery_info);
      },
      returnInfo(verified, orderId) {
        fault("get_return_info");
        const o = access(verified, orderId);
        const rets = store.get("returns").filter((r) => r.order_id === o.order_id);
        return pick({ order_id: o.order_id, delivery_time: o.delivery_time,
          days_since_delivery: o.delivery_time ? rules.daysBetween(o.delivery_time, now) : null,
          items: o.lines.map((l) => ({ line_id: l.line_id, product: l.product, variant: l.variant, sale: l.sale,
            return_status: (rets.find((r) => r.line_id === l.line_id) || {}).state || "none" })) }, fields.get_return_info);
      },
      refundStatus(verified, orderId) {
        fault("get_refund_status");
        const o = access(verified, orderId);
        const r = store.get("refunds").filter((x) => x.order_id === o.order_id).pop();
        return pick({ order_id: o.order_id, state: r ? r.state : "none", amount: r ? r.amount : null,
          approval_date: r ? r.approval_time : null, paid_date: r ? r.paid_time : null }, fields.get_refund_status);
      },
      claimInfo(verified, orderId) {
        fault("get_claim_info");
        const o = access(verified, orderId);
        return pick({ order_id: o.order_id, delivery_time: o.delivery_time,
          hours_since_delivery: o.delivery_time ? Math.floor((now - o.delivery_time) / 3600) : null,
          days_since_delivery: o.delivery_time ? rules.daysBetween(o.delivery_time, now) : null,
          items: o.lines.map((l) => ({ line_id: l.line_id, product: l.product, variant: l.variant })) }, fields.get_claim_info);
      },
      orderValue(verified, orderId) {
        fault("get_order_value");
        const o = access(verified, orderId);
        const f = rules.feeRule(o.order_time, o.order_total);
        return pick({ order_id: o.order_id, order_time: o.order_time, order_total: o.order_total, delivery_fee_charged: o.delivery_fee,
          campaign_day: f.campaign, threshold: f.threshold, fee_due: f.fee_due }, fields.get_order_value);
      },
      requestAddressChange(verified, orderId, newAddress) {
        const o = access(verified, orderId);
        if (o.status !== "not_dispatched") refuse("after_dispatch", `${orderId} is ${o.status.replace("_", " ")}.`);
        return write("requests", { request_id: nextId("requests", "RQ"), type: "address_change", order_id: orderId, new_address: newAddress,
          for: "Tan Wei Ming", status: "pending", time: now });
      },
      requestCancellation(verified, orderId, reason) {
        const o = access(verified, orderId);
        if (o.status !== "not_dispatched") refuse("after_dispatch", `${orderId} is ${o.status.replace("_", " ")}.`);
        return write("requests", { request_id: nextId("requests", "RQ"), type: "cancellation", order_id: orderId, reason: reason || null,
          for: "Tan Wei Ming", status: "pending", time: now });
      },
      requestReturn(verified, orderId, lineId, reason) {
        const o = access(verified, orderId, lineId);
        const l = o.lines.find((x) => x.line_id === lineId);
        if (!o.delivery_time || rules.daysBetween(o.delivery_time, now) > rules.V.return_days) refuse("return_window_passed", "More than 14 days since delivery.");
        if (l.sale) refuse("sale_item", `${l.product} is a sale item.`);
        return write("requests", { request_id: nextId("requests", "RQ"), type: "return", order_id: orderId, line_id: lineId, reason: reason || null,
          for: "Siti Hajar Kamal", status: "pending", time: now });
      },
      fileDamageReport(verified, orderId, lineId, kind, description) {
        const o = access(verified, orderId, lineId);
        if (!o.delivery_time || now - o.delivery_time > rules.V.report_hours * 3600) refuse("report_window_passed", "More than 48 hours since delivery.");
        return write("claims", { claim_id: nextId("claims", "CL"), type: kind === "wrong_item" ? "wrong_item" : "damaged", order_id: orderId, line_id: lineId,
          description: description || null, for: "Jessica Chan", status: "pending", time: now });
      },
      fileWarrantyClaim(verified, orderId, lineId, description) {
        const o = access(verified, orderId, lineId);
        if (!o.delivery_time || rules.daysBetween(o.delivery_time, now) > rules.V.warranty_days) refuse("warranty_expired", "More than 30 days since delivery.");
        return write("claims", { claim_id: nextId("claims", "CL"), type: "warranty", order_id: orderId, line_id: lineId,
          description: description || null, for: "Jessica Chan", status: "pending", time: now });
      },
      handover(rec) { return write("handovers", Object.assign({ handover_id: nextId("handovers", "HO"), status: "pending", time: now }, rec)); },
      orderFor: order,
    };
  }
  return { createRules, createBackend };
});
