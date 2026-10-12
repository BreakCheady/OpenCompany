# OpenCompany – real server-function retail sensitivity (2026-10-12)

The SQL script `docs/economy-live-retail-revenue-sim.sql` is read-only and calls the deployed stable SQL function `private.retail_effective_unit_revenue_company` with real company/product combinations and actual historical production unit costs.

**Production query results:** 105 combinations from 5 historically produced product types. Fifteen cases per distinct company/product/quality observation (three input-cost factors 0.85/1.00/1.15 by five price factors 0.80/0.95/1.00/1.05/1.15). 42 cases have nonpositive modeled sales contribution **before retail overhead**, the remainder 63 are positive before overhead.

Cautions:
- These are retail revenue function calls, **not executed sales**.
- Retail overhead, warehouse unit costs and snapshots, dynamic retail demand, available stock and allowed building conditions require separate transaction-aware checks.
- The historical production sample does not cover all 94 product types or Q5. The observed simulation cannot prove full economy profitability.
- A below-cost retail offer can be a deliberate pricing choice; no global price/profit floor is imposed on players.
- Historical account balances, materials and inventory are unaffected.

Related evidence (prior read-only checks): of 87 retail jobs, 33 had both original operating and inventory cost snapshots; none of those 33 was negative by stored retail contribution. Other jobs have incomplete historical snapshots and must not be interpreted as profitable.

Balancing release decision: reject global uncalibrated price mutations. Revisit targeted offers with actual end-to-end stock, fees, retail operating costs and production cases.
