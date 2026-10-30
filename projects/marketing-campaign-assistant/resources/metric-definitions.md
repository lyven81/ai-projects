# Metric definitions (MD)

- **MD-1 Figure record.** Every figure is computed in code and returned with: figure ID, value, metric, scope (a campaign, a platform, or a group such as "Sales campaigns on Instagram") and period (start and end dates). A reply quotes the value exactly and adds the tag, for example "ROAS 3.42x [F-1a2b3c]".
- **MD-2 Spend** = sum of weekly spend (RM). **Revenue** = sum of attributed revenue (RM). **Impressions, clicks, engagements, orders** = sums.
- **MD-3 CTR** = clicks / impressions x 100 (%).
- **MD-4 CPC** = spend / clicks (RM). **CPM** = spend / impressions x 1000 (RM).
- **MD-5 Engagement rate** = engagements / impressions x 100 (%).
- **MD-6 Cost per order** = spend / orders (RM). Undefined at zero orders, never a division by zero.
- **MD-7 Conversion rate** = orders / clicks x 100 (%).
- **MD-8 ROAS** = attributed revenue / spend (x). A return on ad spend before product and delivery costs; it is never profit.
- **MD-9 Attribution.** Revenue and orders are platform-reported with a 7-day click window.
- **MD-10 Reach and frequency** are weekly only. Weekly frequency = weekly impressions / weekly reach. Weekly reach is never summed across weeks, and no period reach or period frequency is reported. Period figures use impressions.
- **MD-11 Spend against budget** = campaign spend - campaign budget (RM); positive means overspend.
- **MD-12 Sales measures.** Every campaign is a Sales campaign (founder, 30 Oct 2026). Campaigns are judged on ROAS, cost per order and orders, with spend, revenue, conversion rate, CTR, CPC and CPM as supporting figures.
- **MD-13 Rounding.** RM, ratios and percentages to 2 decimals, half up.
- **MD-14 Weekly ROAS variation** = population standard deviation of the weekly ROAS values in the status window / their arithmetic mean x 100 (%). Each weekly ROAS is weekly revenue / weekly spend, to 2 decimals; the variation is rounded to 2 decimals and compared after rounding. Undefined when a week has no spend or the mean is zero. Period ROAS stays total revenue / total spend, never the mean of weekly ROAS.
