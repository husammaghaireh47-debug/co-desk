# Co-Desk — Submission content (WebMCP Challenge 2026)

Copy-paste into the Devpost fields and adapt as needed. Keep it concrete and
truthful — the judges explicitly reward specifics and penalize vagueness.

## Project name
Co-Desk — Human + Agent Support Operations

## Tagline (one line)
A WebMCP support desk where a human and an AI agent triage the same live queue,
together, in real time.

## Elevator pitch / What it is
Co-Desk is a WebMCP-native customer-support operations tool. It exposes its full
workflow — list, open, route, note, escalate, resolve — as declared WebMCP tools.
A human works the queue in the browser; an AI agent discovers those tools and
acts inside the real workflow. Because both operate the **same** shared store, a
person can watch the agent clear the routine backlog live and stay in control of
the consequential decisions.

## What can people and agents do together that was hard or impossible before? (required question)
Before WebMCP, an AI agent helping with a real web workflow had to *navigate the
UI and click* — slow, brittle, and unverifiable. Co-Desk changes the division of
labor: the site declares its own operations as tools (`listOpenTickets`,
`getTicket`, `addNote`, `updateStatus`, `assignToTeam`, `escalateTicket`,
`resolveTicket`, `searchTickets`, `summarizeQueue`), each with a JSON Schema and
real effects on the queue.

That means a support team can now hand the agent the *entire routine workload* —
opening requests, appending notes, routing to teams, escalating, resolving the
mechanical cases — while the human watches the same screen update live and
approves or reopens anything that needs judgment. One shared queue, two operators,
with the human always in the loop. That human+agent collaboration on a single
live dataset is exactly what WebMCP unlocks.

## How did you implement WebMCP? (required question)
In `app.js`, `registerTools()` registers each operation against
`document.modelContext` with `registerTool({ name, description, inputSchema,
execute })`. Every tool:
- has a **description** the agent reads to decide when to use it,
- declares an **inputSchema** (JSON Schema) the agent must satisfy,
- runs an **execute(input)** that performs a real action on the shared queue,
  persisted to `localStorage` and written to a live activity feed.

Registration snippet used in the project:
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
  execute: async (input) => { /* real action on the shared queue */ },
});
```
A header badge flips to **"WebMCP connected — agent tools registered"** when the
page loads in a WebMCP-enabled browser, and the code logs the tools visible to
agents after registration.

## Testing instructions (for judges)
1. Open the live URL in Google Chrome with WebMCP enabled
   (`chrome://flags/#enable-webmcp-testing`) or in the ChatGPT in-app browser.
2. Confirm the header badge reads **"WebMCP connected"**.
3. Ask the agent something like:
   > *"Summarize the Co-Desk queue, then handle the password-reset ticket — add a
   > note, route it to account, and show me before resolving."*
4. Watch the queue and activity feed update live as the agent acts. You can also
   click buttons yourself to route, escalate, or resolve — human and agent on the
   same queue.

Without WebMCP, the app still runs as a normal demo desk for exploring the UI
(badge shows "WebMCP not detected (view-only)").

## Built with / tech
- WebMCP (`document.modelContext.registerTool`) — the agent-facing tool layer
- Plain HTML/CSS/JS — no build step, trivially deployable
- localStorage — shared, persistent queue state between the human UI and tools

## Source repository & license
Public repo with an MIT LICENSE at the top (About section) so it is visible.

## What's next / ambition
Beyond the demo: real persistence and auth, approval gates that require a
second human sign-off on high-impact agent actions, audit logging, and multi-tenant
queues. Co-Desk is a pattern for any "shared inbox / ops" product that wants a
genuine human-in-the-loop agent.
