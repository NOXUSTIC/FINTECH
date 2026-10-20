# Technical Documentation & Architecture Specification

## 1. System Architecture

The following text diagram illustrates the architectural flow of ProAct Finance across client UI, deterministic calculation engines, local security boundaries, and optional serverless integrations:

```text
+-------------------------------------------------------------------------------------------------+
|                                     CLIENT RUNTIME (Browser)                                    |
|                                                                                                 |
|   +-----------------------------------------------------------------------------------------+   |
|   |                              React 19 SPA (Vite + Tailwind v4)                          |   |
|   |     [HomeScreen]    [PurchaseCheckScreen]    [InsightsScreen]    [AgentScreen]          |   |
|   +--------------------------------------------+--------------------------------------------+   |
|                                                |                                                |
|   +--------------------------------------------v--------------------------------------------+   |
|   |                               FinanceContext State Engine                               |   |
|   |         * Scenario Management (Baseline ¥175 vs Shortfall -¥85)                         |   |
|   |         * T3 Daily Sandbox Cap Tracking (¥500 cumulative limit)                         |   |
|   |         * Human Override State Management & PIN Modal Handler                           |   |
|   +--------------------------------------------+--------------------------------------------+   |
|                                                |                                                |
|   +--------------------------------------------v--------------------------------------------+   |
|   |                              Centralized api.ts Service Layer                           |   |
|   |                                                                                         |   |
|   |   +--------------------------+   +--------------------------+   +-----------------------+   |
|   |   |   calculateFinancial-    |   |     checkPurchase()      |   |   Rule-Based Safety   |   |
|   |   |        Runway()          |   |  - Need level routing    |   |         Gate          |   |
|   |   |  - Safe-to-Spend formula |   |  - 3-tier funding plan   |   | - T0-T4 tier checks   |   |
|   |   |  - Day-by-day trajectory |   |  - Want override trigger |   | - Exact phrase shield |   |
|   |   +------------+-------------+   +------------+-------------+   +-----------+-----------+   |
|   |                |                              |                             |               |
|   |   +------------v------------------------------v-----------------------------v-----------+   |
|   |   |                          facts.ts Deterministic Engine                              |   |
|   |   |    - computeFacts: 50/30/20 budget math, health score (0-100), savings gap         |   |
|   |   |    - computePurchase: 20% target savings impact, verdicts (ok, stretch, wait)       |   |
|   |   |    - purchaseText: single-source-of-truth copy generation                           |   |
|   |   +-------------------------------------------------------------------------------------+   |
|   |                                                                                         |   |
|   |   +-------------------------------------------------------------------------------------+   |
|   |   |                        Web Crypto SHA-256 Audit Hash Chain                            |   |
|   |   |    - Genesis block link: 000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b6... |   |
|   |   |    - computeEntryHash() + verifyChain() live tamper detection                       |   |
|   |   +-------------------------------------------------------------------------------------+   |
|   +--------------------------------------------+--------------------------------------------+   |
+------------------------------------------------|------------------------------------------------+
                                                 | (Optional Network Layer)
                                                 v
+-------------------------------------------------------------------------------------------------+
|                                 BACKEND SERVICES / VERCEL API                                   |
|                                                                                                 |
|   +----------------------------------+            +-----------------------------------------+   |
|   |         api/chat.js              |            |           pricing.py (Standalone)       |   |
|   |   - Vercel Serverless Function   |            |   - DuckDuckGo / Brave search scraper   |   |
|   |   - DeepSeek chat via LLM_URL     |            |   - Structured JSON-LD / meta parser    |   |
|   |     with LLM_KEY bearer auth      |            |   - Currency FX & SQLite history db     |   |
|   |   - 8s timeout + mock fallback    |            |   - Offline fallback if undeployed      |   |
|   +----------------------------------+            +-----------------------------------------+   |
+-------------------------------------------------------------------------------------------------+
```

---

## 2. The Safe-to-Spend Formula

The financial runway trajectory is calculated deterministically via `calculateFinancialRunway` in [\`web/src/services/api.ts\`](../web/src/services/api.ts#L61):

$$\text{Safe-to-Spend} = \text{Cash on Hand} - \text{Committed Bills} - (\text{Days to Payday} \times \text{Daily Baseline})$$

$$\text{Safe Today} = \max\left(0, \frac{\text{Safe-to-Spend}}{\max(1, \text{Days to Payday})}\right)$$

### Day-by-Day Trajectory Generation
The engine computes projected cash balances across $i = 0 \dots \text{Days to Payday}$:
1. **Day 0**: Starting Cash.
2. **Committed Bill Settlements**:
   - Day 3: Deducts committed electricity and power (e.g., ¥120 if committed bills $\ge 120$).
   - Day 6: Deducts broadband & phone (e.g., ¥80 if committed bills $\ge 200$).
3. **Daily Decrement**: Deducts $\text{Daily Baseline}$ for meals and transit every day $i > 0$.
4. **Payday**: Credits $\text{Monthly Income}$ on Day $N$.
5. **Shortfall Detection**: If running balance drops below ¥0, the date is recorded as `shortfallDate` and `isShortfall` is flagged with `shortfallGap = |Safe-to-Spend|`.

---

## 3. How Need Levels Change Purchase Decisions

Purchase checks in `checkPurchase` handle 3 explicit necessity tiers:

### 1. `essential` Need Level
- **Core Principle**: Essential purchases are **never blocked or forced into a wait status**, regardless of budget tightness.
- **Verdict**: `verdictChip: 'Buy'`, `shouldBuy: true`, `canAfford: true`.
- **Funding Plan**: Generates 3 tiered alternatives funded from unused budget slack:
  - **Second-hand (60% price)**: Preserves maximum runway buffer.
  - **Adequate (100% price)**: Standard baseline option.
  - **Premium (350% price, min ¥900)**: Flagged as unaffordable if runway buffer drops below ¥0.

### 2. `needed_soon` Need Level
- **Core Principle**: Purchase timing is strictly determined by whether safe-to-spend runway covers the item before payday.
- **Verdict**:
  - If $\text{price} \le \text{Safe-to-Spend}$: `verdictChip: 'Buy'`, `shouldBuy: true`. Recommends purchasing today with remaining buffer noted.
  - If $\text{price} > \text{Safe-to-Spend}$: `verdictChip: 'Wait until payday'`, `shouldBuy: false`. Provides calculated wait timeframe until income replenishment.

### 3. `want` Need Level (Discretionary)
- **Core Principle**: Governed by runway buffer impact and savings goal preservation.
- **Heuristics & Decisions**:
  - **Durability Heuristic (Rule 2)**: Items with long-term utility (e.g. "Work boots 60 yuan") trigger `verdictChip: 'Spend more here (buy it for life)'` with `shouldBuy: true`.
  - **Deficit or Expensive Items**: Purchases that exceed safe-to-spend runway or represent expensive items ($\ge \text{¥}800$, e.g. "900 yuan jacket") trigger `verdictChip: 'Wait 24 hours'` with `shouldBuy: false`.
  - **Human Override Autonomy**: When "Wait 24 hours" is recommended, the user can click **"Override anyway"**. This changes state to `overridden: true`, logs rule `R99-HUMAN_OVERRIDE_AUTONOMY` to the permanent audit trail, and confirms *"✓ Logged. We won't nag again."*

---

## 4. What `facts.js` Does

[\`facts.js\`](../facts.js) (and its TypeScript counterpart [\`web/src/services/facts.ts\`](../web/src/services/facts.ts)) serves as the universal single source of truth across browser and CLI:

1. **50/30/20 Budget Guidelines**:
   - Needs: Housing, Utilities, Groceries, Transport, Health ($\le 50\%$ income).
   - Wants: Dining, Shopping, Entertainment, Subscriptions ($\le 30\%$ income).
   - Savings Target: 20% of monthly income ($0.2 \times \text{Income}$).
   - Bills Guideline: Monthly bills should remain $\le 35\%$ of income.
2. **Frequency Normalization**:
   - Normalizes bill frequencies: Weekly ($\times 52/12$), Monthly ($\times 1$), Quarterly ($\times 1/3$), Yearly ($\times 1/12$).
3. **Financial Health Score (0–100)**:
   - Computes weighted score based on savings rate (max 40 pts), needs compliance (max 20 pts), wants compliance (max 20 pts), bill ratio (10 pts), and month-end projection balance (10 pts).
4. **Purchase Affordability Math (`computePurchase`)**:
   - Evaluates whether $\text{Savings Buffer} - \text{Price} \ge \text{20\% Target}$:
     - `ok`: Fits budget while preserving the 20% savings target.
     - `stretch`: Affordable from current cash, but dips into the 20% savings target.
     - `wait`: Cannot be afforded from monthly budget; calculates months required to save for it.
     - `no_income`: Triggers prompt to record income.

---

## 5. How the Permission Gate Works

Every action in the system is evaluated through permission tiers before execution:

```text
User Input / Agent Action
         |
         v
   [T4 Check] ------------> Does input contain injection phrases?
         |                  (ignore rules, transfer 2000, etc.)
         |                  YES: Tag T4, Block Action, Log Security Event.
         v NO
   [T0/T1 Read/Advice] ---> Is it informational or advisory?
         |                  YES: Execute & Display (No state modification).
         v NO
   [T2 Override] ---------> Is it user modifying budget or overriding wait guidance?
         |                  YES: Apply State Change & Log Permanent Override.
         v NO
   [T3 Sandbox Transfer] -> Is it moving funds between Cash & Savings Pot?
         |                  YES: Check Daily Cap (Used Today + Transfer <= 500).
         |                       <= 500: Approve Transfer & Update Cap Counter.
         |                       >  500: Block Transfer with Cap Exceeded Reason.
         v NO
   [T4 External Action] --> Is it an external bill payment?
                            YES: Queue as DRAFT. Demand Interactive PIN Challenge.
```

---

## 6. The LLM Layer with Mock Fallback

1. **Default Mode**:
   - Runs fully client-side with zero network dependencies using the deterministic mock assistant.
2. **Optional Live Mode (DeepSeek)**:
   - Configured via Vercel environment variables (never committed, never exposed to the browser):
     - `LLM_URL`: OpenAI-compatible base URL, e.g. `https://api.deepseek.com/v1`.
     - `LLM_KEY`: Bearer token for the LLM (stored as a Vercel Secret).
     - `LLM_MODEL`: Model name, e.g. `deepseek-chat` (no hardcoded default).
     - `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`: legacy fallback provider, used only when `LLM_URL` is unset.
3. **What is sent to the model**:
   - Only the user's free-form question plus a deterministic "computed block" of locally-calculated numbers (cash, days-to-payday, committed bills, daily baseline, safe-to-spend, savings, income, spending style).
   - Raw SMS/transaction text, action payloads, and injection strings are handled by the local permission gate and never reach the model.
   - A system prompt instructs the model to use only the computed numbers, never invent figures, never claim to execute actions, decline investing/loan/tax advice, and answer in under 120 words.
4. **Resilient Network Handling**:
   - `sendChat` POSTs to `/api/chat` with an `AbortController` timeout of **8,000ms**; the serverless function enforces the same 8s upstream timeout.
   - `api/chat.js` applies a same-origin guard that rejects cross-origin browser requests.
   - On timeout, non-2xx, or empty text, the app falls back to the deterministic mock assistant.
5. **Provider badge**:
   - The response includes a `provider` field; the chat badge shows `DeepSeek` only on a real answer, otherwise `Mock provider (demo mode)`.

## 7. Mock-versus-Real Matrix

| Capability | Category | Implementation Details |
| :--- | :--- | :--- |
| **Runway & Safe-to-Spend** | **Computed by code from demo data** | Deterministic TypeScript calculation (`calculateFinancialRunway`). |
| **50/30/20 Budget Guidelines** | **Computed by code from demo data** | Evaluated via `facts.js` (`computeFacts`). |
| **Purchase Affordability Check** | **Real** | Evaluated via `computePurchase` comparing against 20% savings target. |
| **Product Pricing & Discovery** | **Fallback only, no live price service deployed** | `pricing.py` contains standalone scraper logic; in production web deployment, offline fallback is used. |
| **Audit Hash Chain Verification** | **Real** | Real Web Crypto SHA-256 hash chaining with live tamper-evident detection (`verifyChain`). |
| **Prompt Injection Defense** | **Rule-based filter (exact phrases)** | Regular expression filter intercepting exact override commands. |
| **AI Provider Badge** | **Configurable** | Chat badge shows `DeepSeek` only on a real answer, otherwise `Mock provider (demo mode)`; the purchase-check badge reads `VITE_AI_PROVIDER`. |
| **Bank Import & Duplicate Merge** | **Simulated** | Demonstrates transaction deduplication and payload filtering on mock data. |
| **Sandbox Transfer & Bill Payment** | **Simulated Sandbox** | Enforces ¥500 daily cap and simulated interactive PIN challenge. |
