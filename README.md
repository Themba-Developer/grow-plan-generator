# Black R AI

Black R AI is a conversation-first workspace for producing premium business plans, feasibility studies, financial models, and supporting visuals. It preserves long-form document generation and exports completed work as DOCX or PDF.

## AI architecture

- Gemini 3.7 Flash handles research, grounded information gathering, and long-form drafting.
- GPT-5 handles financial and technical review work.
- GPT-Image-2 creates conceptual document visuals.
- Deterministic application code calculates financial schedules, break-even, NPV, IRR, and payback instead of trusting model arithmetic.

Building, site, and structural visuals are conceptual planning aids, not construction or permit documents. A licensed local professional must verify and sign off on regulated engineering or architectural work.

## Local development

Install Node.js and npm, then run:

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add the required credentials. Provider keys are server-only: never prefix them with `VITE_`.

```dotenv
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
```

Supabase variables in `.env.example` configure authentication, saved conversations, and document storage.

## Verification

```sh
npx tsc --noEmit
npm run build
```
