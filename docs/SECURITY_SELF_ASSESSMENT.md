# Security Self-Assessment & Risk Analysis

This document provides a realistic, code-grounded security assessment of ProAct Finance. It details the actual permission tier architecture, the hard enforcement boundaries, the list of blocked actions, and known risk limitations.

---

## 1. Permission Tiers Architecture (As Implemented)

ProAct Finance enforces a 5-tier permission model (\`T0\` to \`T4\`) to separate read-only guidance from state-modifying and external actions.

| Tier | Name | Implemented Behavior | Enforcement Mechanism | File Location |
| :--- | :--- | :--- | :--- | :--- |
| **T0** | **Read-Only / Informational** | Computes runway balances, 50/30/20 budget allocations, and health scores. No state modification. | Auto-approved. Executes read-only queries with zero side effects. | [\`web/src/services/api.ts\`](../web/src/services/api.ts#L61) |
| **T1** | **Advisory / Suggestions** | Evaluates purchase viability (\`Buy\`, \`Wait 24h\`, \`Buy it for life\`) and subscription pause recommendations. | Auto-approved for presentation; cannot commit funds or alter subscriptions autonomously. | [\`web/src/services/api.ts\`](../web/src/services/api.ts#L480) |
| **T2** | **Configuration & User Override** | Modifies user budget settings (income, baseline, spending style) and allows the user to override "Wait 24h" guidance. | Requires direct human click. Logged permanently to the audit log under rule \`R99-HUMAN_OVERRIDE_AUTONOMY\`. | [\`web/src/context/FinanceContext.tsx\`](../web/src/context/FinanceContext.tsx#L240) |
| **T3** | **Sandbox Financial Operations** | Internal simulated money movements (e.g., Cash on hand to locked Savings Pot). | Requires two-step human approval and is strictly constrained by a hardcoded **¥500 daily cumulative cap**. | [\`web/src/services/api.ts\`](../web/src/services/api.ts#L60), [\`web/src/context/FinanceContext.tsx\`](../web/src/context/FinanceContext.tsx#L290) |
| **T4** | **External Payments & Threat Payloads** | High-stakes external transfers (utility bill payments) and adversarial injection strings. | External payments remain in **Draft** state requiring interactive PIN challenge. Prompt injections are classified as T4 threats and immediately blocked. | [\`web/src/services/api.ts\`](../web/src/services/api.ts#L680), [\`web/src/components/common/PinPadModal.tsx\`](../web/src/components/common/PinPadModal.tsx) |

---

## 2. Blocked Actions List

The system explicitly blocks the following actions at runtime:

1. **Unconfirmed External Fund Transfers**:
   - Any external payment (e.g., "Pay electricity bill ¥120") is restricted to a draft status. Automated execution without human PIN confirmation is blocked.
2. **Sandbox Transfers Exceeding the Daily Cap**:
   - The sandbox money movement engine enforces a hard cumulative limit of ¥500/day. Any transfer pushing cumulative daily transfers over ¥500 (such as a second ¥300 transfer after a prior ¥300 transfer) is blocked by rule \`R12-INTERNAL_SANDBOX_TRANSFER_CAP\`.
3. **Known Prompt Injection Payloads**:
   - Inputs matching known adversarial override phrases (\`ignore rules\`, \`transfer 2000\`, \`transfer 2,000\`, \`system prompt\`, \`admin override\`) are blocked from queuing actions or reaching any backend AI service.
4. **Tampered Audit Trails**:
   - Any client-side modification to historical audit records triggers an immediate cryptographic validation error in \`verifyChain()\`.

---

## 3. Known-Risk Analysis & Scope Limitations

This section documents what is implemented, where it lives in the code, and what is **NOT covered**.

### Risk 1: Prompt Injection & Adversarial Payloads
- **What is Implemented**:
  - Exact phrase filtering in \`sendChat\` and \`importData\` using regex:
    \`/(ignore\\s+rules|transfer\\s+2[,.]?000|system\\s+prompt|admin\\s+override)/i\`.
  - When detected, the request is marked \`isInjectionFlagged = true\`, \`isBlocked = true\`, no action payload is generated, and a T4 security block is logged.
- **Where in Code**:
  - [\`web/src/services/api.ts\`](../web/src/services/api.ts#L610) (\`importData\`)
  - [\`web/src/services/api.ts\`](../web/src/services/api.ts#L690) (\`sendChat\`)
- **What is NOT Covered**:
  - **Limitation**: The filter matches specific exact phrases only. It does **not** protect against sophisticated evasion techniques, multi-step indirect prompt injections, base64 encoding, multilingual prompts, or novel semantic rephrasing.

---

### Risk 2: Wrong Numbers / Hallucinations from Language Models
- **What is Implemented**:
  - **Mathematical Isolation**: The philosophy is *"Code does the math, the model writes the words."*
  - All numerical projections, runway calculations (\`Cash - Bills - Days * Baseline\`), 50/30/20 guidelines, and purchase check affordability tiers are calculated deterministically in TypeScript and JavaScript.
  - The model only receives verified numerical outputs as context.
- **Where in Code**:
  - [\`facts.js\`](../facts.js)
  - [\`web/src/services/facts.ts\`](../web/src/services/facts.ts#L108)
  - [\`web/src/services/api.ts\`](../web/src/services/api.ts#L61)
- **What is NOT Covered**:
  - **Limitation**: When a live LLM is connected via \`/api/chat\` (\`LLM_URL\` or Anthropic), the model could hallucinate advice or make qualitative errors in conversational responses if not constrained by prompt formatting.

---

### Risk 3: Over-Permissioned Actions & Autonomous Financial Drift
- **What is Implemented**:
  - Dual-gate safety model:
    - Tier T3 is capped at ¥500/day.
    - Tier T4 requires simulated 4-digit PIN confirmation.
- **Where in Code**:
  - [\`web/src/services/api.ts\`](../web/src/services/api.ts#L60) (\`evaluateT3Transfer\`)
  - [\`web/src/context/FinanceContext.tsx\`](../web/src/context/FinanceContext.tsx#L290)
  - [\`web/src/components/common/PinPadModal.tsx\`](../web/src/components/common/PinPadModal.tsx)
- **What is NOT Covered**:
  - **Limitation**: In this demo environment, all money movement and PIN validation is local simulation. No real banking ledger, bank API tokens, or hardware security modules (HSM) are integrated.

---

### Risk 4: Personal Financial Data (PII) Sent to Remote AI Models
- **What is Implemented**:
  - The chat model is contacted **only for free-form questions**, and only the question from the user plus a deterministic computed block of locally-calculated numbers (cash, days-to-payday, committed bills, daily baseline, safe-to-spend, savings, income, spending style) is transmitted.
  - Raw SMS or transaction text, action payloads, and injection strings are handled by the local permission gate and are **never sent to the model**.
  - The API key (`LLM_KEY`) lives in **Vercel environment variables only** and is never exposed to the browser or committed to the repo.
  - If `/api/chat` is unconfigured, fails, times out (8s), or returns empty text, the app falls back to the deterministic mock assistant and no external call succeeds.
- **Where in Code**:
  - [`web/src/services/api.ts`](../web/src/services/api.ts) (`sendChat` builds the computed block and calls `/api/chat`)
  - [`api/chat.js`](../api/chat.js) (serverless proxy; reads `LLM_URL` / `LLM_KEY` / `LLM_MODEL` from Vercel env only)
- **What is NOT Covered**:
  - **Limitation**: If a developer configures `LLM_URL` (and optionally `LLM_KEY`), the free-form question and computed numbers are sent over HTTPS to that external service. There is no automated PII scrubber (e.g. masking account numbers or names) beyond the rule of never sending raw transaction text.

---

### Risk 5: Audit Log Tampering & Historical Alteration
- **What is Implemented**:
  - Every entry is hashed using browser Web Crypto API (\`crypto.subtle.digest('SHA-256')\`).
  - Blocks are chained via \`prevHash\`, beginning with Bitcoin genesis block \`000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f\`.
  - The \`verifyChain()\` function validates that every entry matches its computed hash and parent link.
- **Where in Code**:
  - [\`web/src/services/api.ts\`](../web/src/services/api.ts#L225) (\`computeEntryHash\`, \`createAuditEntry\`, \`verifyChain\`)
- **What is NOT Covered**:
  - **Limitation**: The hash chain runs in client-side memory. While it detects in-place record alteration, a malicious actor with browser DevTools access could re-hash the entire chain from scratch because there is no server-side cryptographic signature (HMAC) or decentralized proof-of-work/stake.

---

### Risk 6: Erroneous Parsing of Real-World Bank Statements & SMS
- **What is Implemented**:
  - Basic regex merchant and amount extractor with duplicate merging (\`mergedWith: 'Alipay #AP-9904'\`).
- **Where in Code**:
  - [\`web/src/services/api.ts\`](../web/src/services/api.ts#L610) (\`importData\`)
- **What is NOT Covered**:
  - **Limitation**: Uses simulated mock extraction. There is no real Open Banking protocol (e.g. Plaid, Teller) or multi-format PDF/CSV financial transaction parser. Complex bank statements with varied formatting or currencies are not supported.

---

### Risk 7: Authentication & Access Control
- **What is Implemented**:
  - Client-side mock user profile (Alex scenario).
- **Where in Code**:
  - [\`web/src/services/api.ts\`](../web/src/services/api.ts#L137) (\`DEFAULT_ALEX_FINANCIALS\`)
- **What is NOT Covered**:
  - **Limitation**: No user authentication system exists. There is no login, no session cookie, no password hashing, and no multi-tenant isolation.
