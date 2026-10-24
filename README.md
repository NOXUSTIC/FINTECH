# ProAct Personal Finance & Runway Assistant

**Code does the math, the model writes the words.**

A personal-finance assistant where every number comes from a deterministic engine (`facts.js`) and the LLM only turns those values into sentences. The model never calculates, so it cannot hallucinate a figure.

## How it works

```
User input ──► facts.js (50/30/20, safe-to-spend, purchase math, projections, health score)
                  │
                  ▼
             `facts` object ──► LLM (api/chat.js proxy) ──► copies values into prose
                  │
                  └──► Web UI renders the same numbers directly
```

- `facts.js` computes the savings gap, 20% cuts, yearly-to-monthly conversion, projections and health score.
- The web app, `gen_data.py` and `facts_cli.js` all use the same engine, so training data and live serving see identical inputs.
- `web/src/services/facts.ts` is the TypeScript port of `facts.js`. Keep the two in sync.
- Security tiers (T0–T4), blocked actions and known limits are in [`docs/SECURITY_SELF_ASSESSMENT.md`](docs/SECURITY_SELF_ASSESSMENT.md).
- The system diagram, safe-to-spend formula and facts engine are in [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md).

## Project structure

```
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
├── web/                             # Modern React UI (ProAct Personal Finance & Runway Assistant)
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

## Quick start

### 1. Test the engine

```bash
node facts_cli.js
```

### 2. Run the web app (React)

```bash
cd web
npm install
npm run dev        # Vite dev server, proxies /api
npm test           # Vitest
npm run build      # production build
```

### 3. Run the classic dashboard

```bash
python serve_local.py
```

`index.html` loads `facts.js` from the same folder, so always deploy both files together.

## LLM backend

`api/chat.js` is a serverless proxy for any OpenAI-compatible endpoint (DeepSeek, a local vLLM server, etc.). The API key stays server-side and is never shipped to the browser.

Create a `.env` file in the repo root:

```bash
LLM_URL=http://localhost:8000/v1
```

Then run locally with the Vercel CLI:

```bash
vercel dev
```

Deploy with `vercel --prod`. Build and route settings live in `vercel.json`.

## Train your own model (Linux, NVIDIA GPU)

```bash
conda activate fin
node --version || conda install -y -c conda-forge nodejs     # gen_data.py needs node
python gen_data.py 6000                                      # generate 6000 synthetic examples
nohup python train.py > train.log 2>&1 &                     # LoRA fine-tune
tail -f train.log
python eval.py                                               # run after "saved finance-llm-merged"
```

`train.py` uses batch size 4 × gradient accumulation 4. If you hit **CUDA out of memory**, switch to 2 × 8.

### Serve the fine-tuned model

```bash
conda activate serve
vllm serve ./finance-llm-merged --served-model-name finance-llm --port 8000
echo "LLM_URL=http://localhost:8000/v1" > .env && vercel dev
```

## Optional components

| Component | Purpose |
|---|---|
| `pricing.py` + `products.json` | Live product price lookup via DuckDuckGo / Brave, with pinned URLs and per-store overrides |
| `wechat_server.py` | Bridges the assistant to WeChat |

## Evidence

Everything in `evidence/` is reproducible: the 7-scenario execution report, a sample SHA-256 audit hash chain, and the console log from install, test and build. Scripts that regenerate it are in `web/src/scripts/`.

## Security

Actions are classified into tiers T0–T4. Some actions are blocked outright, and known risks are listed openly. See [`docs/SECURITY_SELF_ASSESSMENT.md`](docs/SECURITY_SELF_ASSESSMENT.md).

## License

Add a `LICENSE` file and name it here.
