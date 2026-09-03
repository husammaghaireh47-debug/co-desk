# Co-Desk — Human + Agent Support Operations

A **WebMCP-native support desk** where a human and an AI agent triage the *same*
live ticket queue together, in real time.

**What it makes possible:** an agent no longer has to guess its way through your
UI. Co-Desk exposes its whole workflow as declared WebMCP tools
(`document.modelContext.registerTool`). A person can open the app and work; an AI
agent (in ChatGPT or Chrome with WebMCP enabled) can discover those tools and act
inside the real workflow. Both operate one shared queue, and every action shows
up live on screen — so a human stays in the loop and can review, approve, escalate
or undo what the agent did.

## Why this was hard/impossible before
Web agents previously could only *navigate* a page and *click* — unreliable and
unverifiable. With WebMCP, Co-Desk tells the agent exactly what it is allowed to
do (`listOpenTickets`, `getTicket`, `createTicket`, `addNote`, `updateStatus`,
`assignToTeam`, `escalateTicket`, `resolveTicket`, `searchTickets`,
`summarizeQueue`), each with a JSON Schema and real side effects on the shared
queue. A human and an agent can therefore **collaborate on the same workload**
— the agent clears the routine backlog while the human watches live and owns the
consequential calls.

## How WebMCP is implemented
Every tool is registered against `document.modelContext` (see `registerTools()`
in [`app.js`](app.js)). Each tool:
- has a `name` and `description` the agent reads,
- declares an `inputSchema` (JSON Schema) the agent fills in,
- runs an `execute(input)` that performs a real action on the shared store
  (persisted to `localStorage`) and records it in the live activity feed.

Registration snippet used in this project:
```js
await document.modelContext.registerTool({
  name: "resolveTicket",
  description: "Resolve a ticket with a short resolution summary.",
  inputSchema: {
    type: "object",
    properties: {
      ticketId: { type: "string" },
      resolution: { type: "string" },
    },
    required: ["ticketId", "resolution"],
  },
  execute: async (input) => { /* ... */ },
});
```

## Try it

1. **Open the live URL** — https://husammaghaireh47-debug.github.io/co-desk/ — in **Google Chrome with WebMCP
   enabled** (`chrome://flags/#enable-webmcp-testing`), or in the **ChatGPT
   desktop / in-app browser**.
2. When the app loads, the header badge should read **"WebMCP connected — agent
   tools registered"**.
3. Give an agent a task, for example:
   > *"Look at the Co-Desk support queue. Summarize it, then handle the
   > password-reset request: add a note, route it to account, and walk me through
   > before resolving."*
4. Watch the queue update **live** on screen as the agent acts — while you can
   still click buttons yourself, route teams, escalate, or reopen anything.

Without a WebMCP browser the app still runs as a normal demo desk (header shows
**"WebMCP not detected (view-only)"**) so you can explore the UI.

## Deploy (no build step — plain static files)

Upload this folder to any static host. Drag-and-drop works on Netlify Drop,
Vercel, Cloudflare Pages, GitHub Pages, or Render:

- **Netlify Drop:** https://app.netlify.com/drop — drag the folder, done.
- **Vercel:** `npx vercel` in this folder.
- **Cloudflare Pages:** dashboard → Create project → upload `index.html`/assets.
- **GitHub Pages:** push this folder to a repo → Settings → Pages → root.

**Important for judging:** open the deployed URL in a **WebMCP-enabled** browser
so the tools register and the badge turns green.

## Reset demo data
Use the **"reset demo data"** link in the footer to restore the seeded queue.

## License
MIT — see [LICENSE](LICENSE).
