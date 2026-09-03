/* Co-Desk — Human + Agent support operations over a shared live queue.
 *
 * The same queue is driven two ways:
 *   - a human clicks buttons in the UI  (actor = "human")
 *   - an AI agent calls the WebMCP tools below (actor = "agent")
 * Every change is written to the shared store and re-rendered live, so a person
 * and an agent genuinely operate the SAME workload together in real time.
 */
"use strict";

/* ------------------------------------------------------------------ *
 *  Data store (localStorage-backed) + change bus
 * ------------------------------------------------------------------ */
const LS_KEY = "cowork.queue.v1";
const store = {
  tickets: [],
  activity: [],
  listeners: new Set(),
  get raw(){ return { tickets: this.tickets, activity: this.activity }; },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && Array.isArray(raw.tickets)) { store.tickets = raw.tickets; store.activity = raw.activity || []; return; }
  } catch (_) {}
  seed();
}
function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(store.raw)); } catch (_) {} }
function emit() { persist(); store.listeners.forEach((fn) => fn()); }
function subscribe(fn) { store.listeners.add(fn); return () => store.listeners.delete(fn); }

function logActivity(verb, ticketId, who) {
  store.activity.unshift({
    at: new Date().toISOString(),
    who,
    verb,
    ticketId: ticketId || null,
  });
  if (store.activity.length > 60) store.activity.length = 60;
}

let _seq = 100;
function nextId() {
  const base = "T" + (++_seq);
  return base + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}
function nowIso() { return new Date().toISOString(); }

const TEAMS = ["billing", "product", "technical", "account"];
const STATUSES = ["open", "in_progress", "resolved", "closed"];

function seed() {
  const mk = (partial) => Object.assign({
    id: nextId(), status: "open", priority: "medium", team: null,
    notes: [], createdBy: "human", createdByAt: nowIso(),
  }, partial);
  store.tickets = [
    mk({ id: "T101", subject: "Overcharged on monthly plan", requester: "sara@acme.io", category: "billing", priority: "high", description: "Invoice shows $49 but agreement is $29.", team: "billing" }),
    mk({ id: "T102", subject: "Cannot reset password", requester: "omar@startup.co", category: "account", priority: "urgent", description: "Reset link never arrives.", team: "account" }),
    mk({ id: "T103", subject: "Export hangs for large report", requester: "lena@datafy.com", category: "technical", priority: "medium", description: "CSV export spins forever on 50k rows.", team: "technical" }),
    mk({ id: "T104", subject: "Feature request: dark mode export", requester: "ken@acme.io", category: "product", priority: "low", description: "Would help night shift review." }),
  ];
  store.activity = [];
}

/* ------------------------------------------------------------------ *
 *  Tool definitions (this is what the agent can do on the site)
 * ------------------------------------------------------------------ */
const OBJECT = { type: "object" };
function idProp() {
  return { type: "string", description: "Ticket id, e.g. T101" };
}

const TOOLS = [
  {
    name: "listOpenTickets",
    description: "List all currently open or in-progress tickets in the queue, with id, subject, requester, category, priority and team.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: STATUSES } }, additionalProperties: false },
    run: (input) => {
      const list = store.tickets.filter((t) => !input.status || t.status === input.status);
      return list.length
        ? "Open tickets:\n" + list.map((t) => `• ${t.id} [${t.priority}/${t.status}] ${t.subject} (${t.requester}, ${t.category}, team=${t.team || "unassigned"})`).join("\n")
        : "No matching tickets.";
    },
  },
  {
    name: "getTicket",
    description: "Return full detail for a single ticket by id, including notes and description.",
    inputSchema: { type: "object", properties: { ticketId: idProp() }, required: ["ticketId"], additionalProperties: false },
    run: (input) => {
      const t = store.tickets.find((x) => x.id === input.ticketId);
      if (!t) return `No ticket ${input.ticketId}.`;
      return `Ticket ${t.id}\nSubject: ${t.subject}\nRequester: ${t.requester}\nCategory: ${t.category}\nPriority: ${t.priority}\nStatus: ${t.status}\nTeam: ${t.team || "unassigned"}\nDescription: ${t.description}` +
        (t.notes.length ? "\nNotes:\n" + t.notes.map((n) => `  - ${n.text} (${n.who})`).join("\n") : "");
    },
  },
  {
    name: "createTicket",
    description: "Open a new support ticket in the shared queue.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string" }, requester: { type: "string" },
        category: { type: "string", enum: ["billing", "product", "technical", "account", "general"] },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        description: { type: "string" },
      },
      required: ["subject", "requester"], additionalProperties: false,
    },
    run: (input) => {
      const t = {
        id: nextId(), subject: input.subject, requester: input.requester,
        category: input.category || "general", priority: input.priority || "medium",
        status: "open", team: null, description: input.description || "",
        notes: [], createdBy: "agent", createdByAt: nowIso(), updatedBy: "agent", updatedAt: nowIso(),
      };
      store.tickets.unshift(t);
      logActivity(`created ticket ${t.id}`, t.id, "agent");
      emit();
      return `Created ${t.id}: "${t.subject}" (${t.priority}) for ${t.requester}.`;
    },
  },
  {
    name: "addNote",
    description: "Append a plain-text note to a ticket, optionally tagging the team/owner.",
    inputSchema: { type: "object", properties: { ticketId: idProp(), note: { type: "string" } }, required: ["ticketId", "note"], additionalProperties: false },
    run: (input) => {
      const t = store.tickets.find((x) => x.id === input.ticketId);
      if (!t) return `No ticket ${input.ticketId}.`;
      t.notes.push({ who: "agent", text: input.note, at: nowIso() });
      touch(t, "agent");
      logActivity(`noted ticket ${t.id}`, t.id, "agent");
      emit();
      return `Note added to ${t.id}.`;
    },
  },
  {
    name: "updateStatus",
    description: "Set a ticket's status to one of open, in_progress, resolved, closed.",
    inputSchema: { type: "object", properties: { ticketId: idProp(), status: { type: "string", enum: STATUSES } }, required: ["ticketId", "status"], additionalProperties: false },
    run: (input) => {
      const t = store.tickets.find((x) => x.id === input.ticketId);
      if (!t) return `No ticket ${input.ticketId}.`;
      t.status = input.status;
      if (input.status === "resolved") t.resolvedAt = nowIso();
      touch(t, "agent");
      logActivity(`set ${t.id} → ${input.status}`, t.id, "agent");
      emit();
      return `${t.id} is now ${input.status}.`;
    },
  },
  {
    name: "assignToTeam",
    description: "Route a ticket to a team: billing, product, technical, account.",
    inputSchema: { type: "object", properties: { ticketId: idProp(), team: { type: "string", enum: TEAMS } }, required: ["ticketId", "team"], additionalProperties: false },
    run: (input) => {
      const t = store.tickets.find((x) => x.id === input.ticketId);
      if (!t) return `No ticket ${input.ticketId}.`;
      t.team = input.team;
      touch(t, "agent");
      logActivity(`routed ${t.id} → ${input.team}`, t.id, "agent");
      emit();
      return `${t.id} assigned to ${input.team}.`;
    },
  },
  {
    name: "escalateTicket",
    description: "Escalate a ticket (raises to urgent priority) and adds an escalation note.",
    inputSchema: { type: "object", properties: { ticketId: idProp(), reason: { type: "string" } }, required: ["ticketId"], additionalProperties: false },
    run: (input) => {
      const t = store.tickets.find((x) => x.id === input.ticketId);
      if (!t) return `No ticket ${input.ticketId}.`;
      t.priority = "urgent";
      t.notes.push({ who: "agent", text: "ESCALATED — " + (input.reason || "needs attention"), at: nowIso() });
      touch(t, "agent");
      logActivity(`escalated ${t.id}`, t.id, "agent");
      emit();
      return `${t.id} escalated to urgent.`;
    },
  },
  {
    name: "resolveTicket",
    description: "Resolve a ticket with a short resolution summary. Keep the human on the page informed so they can review.",
    inputSchema: { type: "object", properties: { ticketId: idProp(), resolution: { type: "string" } }, required: ["ticketId", "resolution"], additionalProperties: false },
    run: (input) => {
      const t = store.tickets.find((x) => x.id === input.ticketId);
      if (!t) return `No ticket ${input.ticketId}.`;
      t.status = "resolved";
      t.resolvedAt = nowIso();
      t.notes.push({ who: "agent", text: "RESOLVED — " + input.resolution, at: nowIso() });
      touch(t, "agent");
      logActivity(`resolved ${t.id}`, t.id, "agent");
      emit();
      return `${t.id} resolved: ${input.resolution}`;
    },
  },
  {
    name: "searchTickets",
    description: "Search ticket subject, requester and description for a term.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
    run: (input) => {
      const q = String(input.query).toLowerCase();
      const list = store.tickets.filter((t) =>
        [t.subject, t.requester, t.description, t.category, t.id].join(" ").toLowerCase().includes(q));
      return list.length
        ? "Matches:\n" + list.map((t) => `• ${t.id} [${t.priority}/${t.status}] ${t.subject} (${t.requester})`).join("\n")
        : "No matches.";
    },
  },
  {
    name: "summarizeQueue",
    description: "Return a concise summary of the whole queue by status and priority, for a quick human review.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const counts = {};
      for (const t of store.tickets) counts[t.status] = (counts[t.status] || 0) + 1;
      const urgent = store.tickets.filter((t) => t.priority === "urgent" || (t.priority === "high" && t.status !== "resolved")).length;
      return `Queue summary:\n${Object.entries(counts).map(([s, c]) => `  ${s}: ${c}`).join("\n")}\nHigh/urgent outstanding: ${urgent}`;
    },
  },
];

function touch(t, who) { t.updatedBy = who; t.updatedAt = nowIso(); }

/* ------------------------------------------------------------------ *
 *  WebMCP registration — the agent-facing surface of this site
 * ------------------------------------------------------------------ */
async function registerTools() {
  const ctx = document.modelContext;
  if (!ctx || typeof ctx.registerTool !== "function") {
    setMcpStatus(false);
    console.warn("Co-Desk: no document.modelContext — run in a WebMCP-enabled browser (Chrome flag) or ChatGPT in-app browser.");
    return;
  }
  setMcpStatus(true);
  for (const tool of TOOLS) {
    try {
      await ctx.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: async (input) => tool.run(input || {}),
      });
    } catch (err) {
      console.error("Failed to register " + tool.name, err);
    }
  }
  // Optional discovery demonstration
  try {
    const list = await ctx.getTools();
    console.log("Co-Desk registered; tools visible to agents:", (list || []).map((t) => t.name).join(", "));
  } catch (_) {}
}

/* ------------------------------------------------------------------ *
 *  UI
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
let currentFilter = "all";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function fmt(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch (_) { return ""; }
}

function render() {
  const q = store.tickets.slice().sort((a, b) => (b.priority === a.priority ? 0 : 0));
  const order = { urgent: 0, high: 1, medium: 2, low: 3 };
  store.tickets.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9) || (a.id < b.id ? -1 : 1));

  const visible = store.tickets.filter((t) => currentFilter === "all" || t.status === currentFilter);

  $("m-open").textContent = store.tickets.filter((t) => t.status === "open").length;
  $("m-progress").textContent = store.tickets.filter((t) => t.status === "in_progress").length;
  $("m-high").textContent = store.tickets.filter((t) => t.status !== "resolved" && (t.priority === "high" || t.priority === "urgent")).length;
  $("m-resolved").textContent = store.tickets.filter((t) => t.status === "resolved").length;
  $("m-byagent").textContent = store.tickets.filter((t) => t.createdBy === "agent" || t.updatedBy === "agent").length;

  $("empty").style.display = visible.length ? "none" : "";
  $("tickets").innerHTML = visible.map((t) => {
    const notes = t.notes.slice(-3).map((n) =>
      `<li class="${n.who === "agent" ? "by-agent" : ""}"><b>${esc(n.who)}</b> · ${esc(n.text)} <span class="meta">${fmt(n.at)}</span></li>`).join("");
    return `<li class="ticket p-${t.priority}">
      <div class="t-top">
        <span class="badge">${esc(t.id)}</span>
        <span class="badge s-${t.status}">${esc(t.status)}</span>
        <span class="badge">${esc(t.priority)}</span>
        <span class="badge">${esc(t.category)}</span>
        <span class="subj">${esc(t.subject)}</span>
        ${t.updatedBy ? `<span class="badge ${t.updatedBy}">last moved by ${esc(t.updatedBy)}</span>` : ""}
      </div>
      <div class="meta">${esc(t.requester)}${t.team ? " · team: " + esc(t.team) : ""}${t.description ? " · " + esc(t.description.slice(0, 90)) : ""}</div>
      ${notes ? `<ul class="notes">${notes}</ul>` : ""}
      <div class="t-top" style="margin-top:8px">
        <button data-act="status" data-id="${esc(t.id)}" data-v="in_progress">→ in progress</button>
        <button data-act="status" data-id="${esc(t.id)}" data-v="resolved">✓ resolve</button>
        <button data-act="escalate" data-id="${esc(t.id)}">▲ escalate</button>
        <select data-act="team" data-id="${esc(t.id)}"><option value="">route team…</option>${TEAMS.map((tm) => `<option value="${tm}" ${t.team === tm ? "selected" : ""}>${tm}</option>`).join("")}</select>
      </div>
    </li>`;
  }).join("");

  $("activity").innerHTML = store.activity.slice(0, 30).map((a) => {
    const who = a.who === "agent" ? `<span class="who-agent">agent</span>` : `<span class="who-human">human</span>`;
    return `<li><span class="meta">${fmt(a.at)}</span> ${who} ${esc(a.verb)}</li>`;
  }).join("") || `<li class="empty">No activity yet — try both sides of the desk.</li>`;
}

function setMcpStatus(ok) {
  const el = $("mcpStatus");
  el.classList.remove("ok", "err");
  el.classList.add(ok ? "ok" : "err");
  $("mcpStatusText").textContent = ok
    ? "WebMCP connected — agent tools registered"
    : "WebMCP not detected (view-only)";
}

/* Human-side actions (actor = human) */
function humanCreate() {
  const subject = $("f-subject").value.trim();
  const requester = $("f-requester").value.trim();
  if (!subject || !requester) { alert("Subject and requester are required."); return; }
  const t = {
    id: nextId(), subject, requester,
    category: $("f-category").value, priority: $("f-priority").value,
    status: "open", team: null, description: $("f-description").value.trim(),
    notes: [], createdBy: "human", createdByAt: nowIso(), updatedBy: "human", updatedAt: nowIso(),
  };
  store.tickets.unshift(t);
  logActivity(`created ticket ${t.id}`, t.id, "human");
  ["f-subject", "f-requester", "f-description"].forEach((i) => ($(i).value = ""));
  emit();
}
function humanAct(act, id, val) {
  const t = store.tickets.find((x) => x.id === id);
  if (!t) return;
  if (act === "status") { t.status = val; if (val === "resolved") t.resolvedAt = nowIso(); logActivity(`set ${t.id} → ${val}`, t.id, "human"); }
  else if (act === "escalate") { t.priority = "urgent"; t.notes.push({ who: "human", text: "escalated (human)", at: nowIso() }); logActivity(`escalated ${t.id}`, t.id, "human"); }
  else if (act === "team") { t.team = val || null; logActivity(`routed ${t.id} → ${val || "unassigned"}`, t.id, "human"); }
  touch(t, "human");
  emit();
}

function resetData() { localStorage.removeItem(LS_KEY); store.tickets = []; store.activity = []; seed(); emit(); }

/* Boot */
function bindUI() {
  $("btn-create").addEventListener("click", humanCreate);
  document.querySelectorAll("input,textarea,select").forEach((el) =>
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && el.id === "f-subject") humanCreate(); }));
  $("tickets").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (b) humanAct(b.dataset.act, b.dataset.id, b.dataset.v);
  });
  $("tickets").addEventListener("change", (e) => {
    const s = e.target.closest("select[data-act]");
    if (s) humanAct(s.dataset.act, s.dataset.id, s.value);
  });
  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-f]");
    if (!b) return;
    currentFilter = b.dataset.f;
    document.querySelectorAll("#filters button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    render();
  });
  $("reset").addEventListener("click", (e) => { e.preventDefault(); resetData(); });
}

/* Boot only in a browser (the UI needs the DOM); keep Node importable for tests. */
if (typeof document !== "undefined") {
  load();
  subscribe(render);
  bindUI();
  render();
  registerTools();
}

/* Export internals when run under Node so the tool logic is unit-testable.
 * In the browser this block is inert (module is undefined in classic scripts). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { TOOLS, store, seed, load, nextId, STATUSES, TEAMS };
}
