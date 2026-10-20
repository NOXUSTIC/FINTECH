# ProAct Personal Finance & Runway Assistant

> **"Code does the math, the model writes the words."**

ProAct Finance combines a high-performance React web application with a deterministic financial calculation engine (`facts.js`), live store price discovery (`pricing.py`), cryptographic audit trails (SHA-256 hash chain), and optional LLM integration.

All figures, savings targets, and purchase affordability verdicts are computed deterministically in code—the AI model only communicates the verified figures into natural explanations, eliminating hallucinations.

---

## Documentation & Evidence

- **[Technical Architecture Documentation](docs/TECHNICAL_DOCUMENTATION.md)**: System architecture text diagram, safe-to-spend formula, need levels, permission gate, and LLM fallback specification.
- **[Security Self-Assessment & Risk Analysis](docs/SECURITY_SELF_ASSESSMENT.md)**: Real implementation analysis of T0–T4 permission tiers, hard enforcement boundaries, blocked actions list, and known risk limits.
- **[Empirical Execution Evidence](evidence/)**:
  - [Execution Report](evidence/execution-report.md): Detailed inputs, outputs, and rules applied for all 7 verified scenarios.
  - [Cryptographic Audit Log Sample](evidence/audit-log-sample.json): Exported SHA-256 chained audit entries.
  - [Test & Build Output Log](evidence/test-output.txt): Captured console log of `npm install`, `npm test` (Vitest), and `npm run build`.

---

## Folder Layout

```text
.
├── api/                             # Vercel serverless backend
│   └── chat.js                      # Serverless LLM proxy (OpenAI-compatible, e.g. DeepSeek)
├── docs/                            # In-depth architectural & security specifications
│   ├── TECHNICAL_DOCUMENTATION.md   # System diagram, safe-to-spend formula, facts engine
│   └── SECURITY_SELF_ASSESSMENT.md  # T0-T4 tiers, blocked actions, known risks & limits
├── evidence/                        # Empirical test & execution artifacts
│   ├── execution-report.md          # 7-scenario execution verification
│   ├── audit-log-sample.json        # Exported SHA-256 audit hash chain
│   └── test-output.txt              # npm install, test, and build console log
├── facts.js                         # Universal deterministic finance engine (50/30/20 & purchase math)
├── facts_cli.js                     # CLI wrapper for testing facts.js
├── pricing.py                       # Live product pricing scraper & discovery (DuckDuckGo / Brave)
├── products.json                    # Pinned product URLs and store overrides
├── serve_local.py                   # Lightweight local Python server (serves web app + /api)
├── index.html                       # Classic standalone single-file dashboard
├── vercel.json                      # Vercel build & route deployment configuration
├── web/                             # Modern React UI (ProAct Finance)
│   ├── index.html                   # React SPA entry point
│   ├── package.json                 # React 19, Tailwind CSS v4, Lucide, Motion, Vitest, Vite
│   ├── vite.config.ts               # Vite bundling and dev proxy configuration
│   └── src/
│       ├── App.tsx                  # Main application wrapper
│       ├── components/              # Modular UI screens (Home, Purchase Check, Insights, Agent, Security)
│       ├── context/                 # React FinanceContext state management
│       ├── scripts/                 # Evidence generation scripts
│       ├── services/                # Service layer
│       │   ├── api.ts               # Centralized API service with offline fallbacks
│       │   ├── api.test.ts          # Vitest test suite
│       │   └── facts.ts             # TypeScript port of facts.js single-source-of-truth
│       └── types/                   # TypeScript domain definitions
├── wechat_server.py                 # Optional WeChat assistant bridge
├── train.py                         # LoRA fine-tuning training script
├── gen_data.py                      # Training dataset generator (uses node + facts.js)
├── eval.py                          # Evaluation benchmark script
└── sample_preview.jsonl             # Sample synthetic dataset preview
```

---

## Mock vs Real Capabilities

To maintain full transparency, here is the exact breakdown of real calculations versus mock/simulated features:

| Feature | Status | Details |
| :--- | :--- | :--- |
| **Runway & Safe-to-Spend Math** | **Computed by code from demo data** | Computed deterministically via `calculateFinancialRunway` (`Cash - Committed Bills - Days × Baseline`). |
| **50/30/20 Budget Guidelines** | **Computed by code from demo data** | Computed via `facts.js` / `facts.ts` (`computeFacts`). Calculates needs, wants, savings rate, and 0–100 financial health score. |
| **Purchase Affordability Check** | **Real** | Computed via `computePurchase`. Compares after-purchase savings directly against 20% savings target to derive exact verdicts (`ok`, `stretch`, `wait`). |
| **Product Pricing & Discovery** | **Fallback only, no live price service deployed** | Scraper and discovery logic exists in `pricing.py`, but no live `/api/price` service is deployed in production; app uses offline pricing fallback. |
| **Cryptographic Audit Trail** | **Real** | Every log entry is hashed with Web Crypto API `crypto.subtle` SHA-256, chained to genesis block `000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f` with live tamper detection. |
| **AI Conversational Chat (`/chat`)** | **Hybrid** | Free-form questions call `/api/chat` (OpenAI-compatible, e.g. DeepSeek via `LLM_URL`/`LLM_MODEL`). Actions and injection checks always run in the local permission gate first. Instantly falls back to the deterministic mock assistant if offline, unconfigured, timed out, or empty. |
| **AI Provider Badge** | **Configurable** | Chat badge shows `DeepSeek` only when DeepSeek actually answered; otherwise it shows `Mock provider (demo mode)`. The purchase-check badge still reads `VITE_AI_PROVIDER`. |
| **Prompt Injection Defense** | **Rule-based filter (exact phrases)** | Rule-based security shield catches override patterns (`ignore rules`, `transfer 2000`) before data reaches any model or database. |
| **Bank / SMS Import** | **Simulated** | Demonstrates multi-channel import, rule-based duplicate detection/merging, and untrusted payload filtering. |
| **Money Movement & Bill Pay** | **Simulated** | T3 sandbox transfers (capped at ¥500/day) and T4 draft bill payment with interactive PIN challenge modal. |

---

## Training Data & Hugging Face

> [!NOTE]
> Hugging Face datasets and trained model weights (`finance-llm-merged`) are used for offline model fine-tuning only. They are intentionally **not included** in this repository to keep the repository lightweight and self-contained. Training datasets can be generated locally via `python gen_data.py 6000`.

---

## How to Run

### 1. Modern React Web UI (Vite)

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The demo runs fully offline with zero external dependencies.

To verify production build and type safety:

```bash
cd web
npm run lint
npm run build
```

### 2. Automated Tests (Vitest)

Run the automated test suite in `web/`:

```bash
cd web
npm test
```

The test suite validates:
- **Runway Math**: Verifies `safe-to-spend` is exactly ¥175 in the baseline and -¥85 in the shortfall scenario.
- **Essential Purchases**: Ensures Essential items are never blocked and provides 3 funding options (¥90 second-hand with ¥85 runway, ¥150 standard with ¥25 runway, and ¥900 premium flagged as unaffordable).
- **Want Discretionary Purchases**: Confirms expensive items (¥900 jacket) trigger "Wait 24 hours" with the override flow, and durable items (boots) trigger "Spend more here (buy it for life)".
- **Sandbox Transfer Limits**: Validates that a second ¥300 transfer is blocked by the ¥500 daily cap.
- **Audit Hash Chain Integrity**: Verifies SHA-256 hash chain tamper-evident detection via `verifyChain()`.
- **Prompt Injection Defense**: Asserts that injection patterns (`ignore rules`, `transfer 2000`) are flagged in both chat and import, blocking unauthorized actions.

### 3. Standalone Python Server (Classic UI + /api)

```bash
python serve_local.py
```

Open [http://localhost:3000](http://localhost:3000) to view the classic single-file web app with live price lookup and model forwarding.

---

## How to Deploy to Vercel

The project is pre-configured with a root `vercel.json` file that instructs Vercel how to build the React application and route API requests:

```json
{
  "buildCommand": "cd web && npm install && npm run build",
  "outputDirectory": "web/dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Option A: Deploy via Vercel CLI

1. Install the Vercel CLI (if not already installed):
   ```bash
   npm i -g vercel
   ```
2. Run deployment from the repository root:
   ```bash
   vercel
   ```
3. To deploy directly to production:
   ```bash
   vercel --prod
   ```

### Option B: Deploy via GitHub & Vercel Dashboard

1. Push the `ui-merge` branch to GitHub and merge into `main` (or deploy directly from `ui-merge`).
2. Log in to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import the `FINTECH` repository.
4. Leave **Root Directory** as `./` (the root).
5. Vercel will automatically detect `vercel.json` and set:
   - **Build Command**: `cd web && npm install && npm run build`
   - **Output Directory**: `web/dist`
   - **Functions**: Serverless handlers in `api/` (e.g. `api/chat.js`) are automatically deployed.
6. Click **Deploy**.

### Optional Environment Variables (Vercel only)

Set these on the Vercel project **Environment Variables** page. They are **never committed** and are **never exposed to the browser** — only the serverless `api/chat.js` function reads them.

- `LLM_URL`: OpenAI-compatible base URL, e.g. `https://api.deepseek.com/v1`.
- `LLM_KEY`: Bearer token for the LLM (secret — Vercel only).
- `LLM_MODEL`: Model name served by the LLM, e.g. `deepseek-chat`. There is no hardcoded default.
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`: Legacy fallback provider, used only when `LLM_URL` is not set.

**What is sent to the model:** only the user's free-form question plus a deterministic "computed block" of the locally-calculated numbers (cash, days-to-payday, committed bills, daily baseline, safe-to-spend, savings, income, spending style). **What is never sent:** raw SMS or transaction text, action payloads, or injection strings — those are handled by the local permission gate and never reach the model.

**Fallback behavior:** if `/api/chat` is unconfigured, fails, times out (8 seconds), or returns empty text, the app falls back to the deterministic mock assistant and the chat badge shows `Mock provider (demo mode)`. It shows `DeepSeek` only when DeepSeek actually answered.

### Chat model (DeepSeek) key rotation

The live site reads `LLM_KEY` from Vercel (Production). To rotate the key without downtime:

1. Create a new key at [platform.deepseek.com](https://platform.deepseek.com) → **API Keys**.
2. Update `LLM_KEY` in Vercel → **Settings → Environment Variables** (environment must be **Production**, not Preview).
3. Redeploy — environment variable changes only apply to new deployments (`vercel --prod`, or **Deployments → Redeploy**).
4. Delete the old key in DeepSeek.

If the key is missing or invalid, `/api/chat` fails and the app falls back to the mock assistant (`Mock provider (demo mode)`) — the site stays up.
