# Review policy (RP)

- **RP-1 Campaign ranking.** Campaigns are ranked on ROAS over the whole requested period. The ranking is descriptive: campaigns ran on different dates, so it is not a like-for-like verdict. The performance period and the status window are shown with separate labels. No spend, result-count or campaign-count gate.
- **RP-2 Platform ranking.** Platforms are ranked on ROAS over the requested period, counting every campaign's weeks inside it, Running and Completed. Descriptive, not proof of future performance. No spend, result-count or campaign-count gate.
- **RP-3 Comparable group.** Comparisons use the campaigns whose results fall inside the requested period.
- **RP-4 Limitations, not a blanket verdict.** Every campaign and platform has its observed figures shown. A limitation is named with its next step (few orders, variable results, missing weeks, a supplied data issue); "not enough evidence" is never the whole answer.
- **RP-5 Partial.** A Running campaign is partial: its figures are shown, labelled partial, and never ranked with Completed campaigns.
- **RP-6 Incomplete.** A campaign with a week missing inside its run is incomplete: the missing week is named and its totals are labelled incomplete. Missing weeks are never filled in.
- **RP-7 Overspend.** A campaign whose spend exceeds its budget is named with the exact amount over.
- **RP-8 Zero results.** Weeks with spend and zero orders are reported as zero; cost per order for such a week is undefined.
- **RP-9 Review status.** Computed in code, first match wins:
  1. **Data issue**: a scheduled week missing inside the status window, or a supplied tracking fault (RP-10) in it.
  2. **Variation not assessable**: fewer than 4 weeks in the window (the week count is stated), a week without spend in a platform window, or average weekly ROAS of zero.
  3. **Limited results**: fewer than 30 orders in the window.
  4. **Variable results**: at least 30 orders and weekly ROAS variation (MD-14) above 30%.
  5. **Consistent results**: at least 30 orders and variation at or below 30%.
  - Campaign window: the campaign's final 4 active weeks (weeks with spend) inside the requested period.
  - Platform window: the last 4 complete calendar weeks of the requested period, the same weeks for every platform. Results are added up by calendar week first, so overlapping campaign weeks count as one week. Zero-spend weeks stay visible.
  - 4 weeks, 30 orders and 30% are unvalidated pilot settings, not industry standards or confidence guarantees. Consistent does not mean profitable or good; low variation can describe consistently poor results.
  - A status never approves spending and never makes a campaign eligible for a test on its own (PR-12).
- **RP-10 Supplied data issues.** A known tracking fault is information supplied by the owner (`data/data_notes.json`), not a fault the assistant detected. It is named with its source and its weeks. Complete weekly rows alone never prove tracking is correct.
- **RP-11 Target check** (only when the owner has entered both targets, BP-8). Over the same window as the review status: ROAS at or above the minimum and cost per order at or below the maximum. Result: meets both targets, meets one target, or meets neither. Judged beside the review status, never instead of it; a status other than Data issue is still shown. Meeting the targets is the owner's own standard, not proof of profit.
