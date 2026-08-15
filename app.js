/* RTP 2026 — app logic: hash router + renderers + live "JETZT" highlight */
"use strict";

let DATA = null;
let filterOnlySetTimes = false;
let searchQuery = "";
let nowTimer = null;
const $view = document.getElementById("view");
const $banner = document.getElementById("error-banner");
const $live = document.getElementById("live-badge");

/* ── Data ─────────────────────────────────────────────── */
async function loadData() {
  try {
    const r = await fetch("data.json?_=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    DATA = await r.json();
  } catch (e) {
    showError("Daten konnten nicht geladen werden: " + e.message);
    $view.innerHTML = '<div class="empty"><div class="big">📡</div>Daten nicht erreichbar.<br>Bitte Seite neu laden.</div>';
  }
}

function showError(msg) {
  $banner.textContent = msg;
  $banner.classList.remove("hidden");
  setTimeout(() => $banner.classList.add("hidden"), 6000);
}

/* ── Time helpers (parade day 2026-08-15, Europe/Berlin) ── */
function paradeDayMs() {
  // Now in Berlin local wall time, mapped onto 2026-08-15
  const now = new Date();
  const berlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t) => parseInt(berlin.find((p) => p.type === t).value, 10);
  const h = get("hour") === 24 ? 0 : get("hour");
  return new Date(2026, 7, 15, h, get("minute")).getTime();
}

function labelToMin(label) {
  // "14:05" → minutes since midnight
  if (!label) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(label);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function nowMinutes() {
  const ms = paradeDayMs();
  return (ms - new Date(2026, 7, 15, 0, 0).getTime()) / 60000;
}

function paradeRunning() {
  const t = nowMinutes();
  return t >= 14 * 60 && t < 22 * 60;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── Router ───────────────────────────────────────────── */
function router() {
  if (!DATA) return;
  const h = location.hash || "#/";
  if (h.startsWith("#/truck/")) {
    renderTruck(decodeURIComponent(h.slice(8)));
  } else if (h === "#/parties") {
    renderParties();
  } else if (h === "#/now") {
    renderNow();
  } else {
    renderList();
  }
  updateNav();
  window.scrollTo(0, 0);
}

function updateNav() {
  const h = location.hash || "#/";
  let active = "list";
  if (h === "#/parties") active = "parties";
  else if (h === "#/now") active = "now";
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === active);
  });
  $live.classList.toggle("hidden", !paradeRunning() || active !== "list" && active !== "now");
}

function go(hash) {
  location.hash = hash;
}

/* ── List view ────────────────────────────────────────── */
function normKey(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function renderList() {
  const trucks = [...DATA.trucks].sort((a, b) =>
    (a.number ?? 9999) - (b.number ?? 9999));

  let filtered = trucks;
  if (filterOnlySetTimes) filtered = filtered.filter((t) => t.hasSetTimes);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const nq = normKey(searchQuery);
    filtered = filtered.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      (t.styles || []).some((s) => s.toLowerCase().includes(q)) ||
      (t.primaryStyle || "").toLowerCase().includes(q) ||
      (t.slots || []).some((s) => nq && normKey(s.artist).includes(nq)) ||
      (t.lineup || []).some((a) => nq && normKey(a).includes(nq)));
  }

  // Group by section
  const groups = new Map();
  for (const t of filtered) {
    const key = t.section || "Ohne Sektion";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  let html = `
    <div class="search-row">
      <input id="search" type="search" placeholder="Suche Float, DJ oder Genre…" value="${esc(searchQuery)}">
    </div>
    <div class="chips">
      <button class="chip ${filterOnlySetTimes ? "" : "active"}" data-filter="all">Alle (${trucks.length})</button>
      <button class="chip ${filterOnlySetTimes ? "active" : ""}" data-filter="settimes">Mit Set-Zeiten (${trucks.filter((t) => t.hasSetTimes).length})</button>
    </div>`;

  if (filtered.length === 0) {
    html += '<div class="empty"><div class="big">🔍</div>Keine Floats gefunden.</div>';
  } else {
    for (const [section, list] of groups) {
      html += `<div class="section-title">${esc(section)}</div>`;
      for (const t of list) {
        html += truckCard(t);
      }
    }
  }
  const prevSearch = document.getElementById("search");
  const hadFocus = document.activeElement === prevSearch;
  const selStart = prevSearch ? prevSearch.selectionStart : 0;
  const selEnd = prevSearch ? prevSearch.selectionEnd : 0;

  $view.innerHTML = html;

  const search = document.getElementById("search");
  if (hadFocus) {
    search.focus({ preventScroll: true });
    search.setSelectionRange(selStart, selEnd);
  }
  search.addEventListener("input", () => {
    searchQuery = search.value;
    renderList();
  });
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      filterOnlySetTimes = c.dataset.filter === "settimes";
      renderList();
    });
  });
}

function truckCard(t) {
  const tag = t.hasSetTimes
    ? `<span class="truck-tag">Set-Zeiten</span>`
    : "";
  const meta = [t.primaryStyle, t.windowStart && t.windowEnd ? `${t.windowStart}–${t.windowEnd}` : ""]
    .filter(Boolean).join(" · ");
  return `
  <a class="truck-card ${t.hasSetTimes ? "hassettimes" : ""}" href="#/truck/${encodeURIComponent(t.id)}">
    <div class="num-badge">${t.number ?? "?"}</div>
    <div class="truck-info">
      <div class="truck-name">${esc(t.name)}</div>
      <div class="truck-meta">${esc(meta)}</div>
    </div>
    ${tag}
  </a>`;
}

/* ── Truck detail ─────────────────────────────────────── */
function renderTruck(id) {
  const t = DATA.trucks.find((x) => x.id === id);
  if (!t) {
    $view.innerHTML = '<div class="empty">Float nicht gefunden.</div>';
    return;
  }
  const now = nowMinutes();

  let slotsHtml = "";
  if (t.hasSetTimes && t.slots.length) {
    let lastEnd = null;
    slotsHtml = t.slots.map((s, i) => {
      const sMin = labelToMin(s.start);
      const eMin = s.end ? labelToMin(s.end) : (i + 1 < t.slots.length ? labelToMin(t.slots[i + 1].start) : labelToMin(t.windowEnd));
      const isNow = sMin !== null && eMin !== null && now >= sMin && now < eMin;
      lastEnd = eMin;
      const time = s.end ? `${s.start}–${s.end}` : s.start;
      return `<div class="slot ${isNow ? "now" : ""}">
        <div class="slot-time">${esc(time)}</div>
        <div class="slot-artist">${esc(s.artist)}</div>
      </div>`;
    }).join("");
  } else {
    slotsHtml = `<div class="info-block"><h3>Set-Zeiten</h3><p>Für diesen Float wurden noch keine Set-Zeiten veröffentlicht. Die Crew postet sie meist kurzfristig auf Instagram.</p></div>`;
  }

  const lineupHtml = t.lineup && t.lineup.length
  ? `<div class="info-block"><h3>Line-Up</h3><div class="lineup-wrap">${t.lineup.map((a) => `<span class="lineup-chip">${esc(a)}</span>`).join("")}</div></div>`
  : "";

  const socials = Object.entries(t.socials || {})
    .filter(([, url]) => url && typeof url === "string")
    .map(([k, url]) => `<a class="social-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(cap(k))}</a>`)
    .join("");

  const windowHtml = (t.windowStart || t.windowEnd)
    ? `<div class="window-bar"><span>${esc(t.windowStart || "?")}–${esc(t.windowEnd || "?")}</span><span class="live-now">${paradeRunning() ? "● Live" : ""}</span></div>`
    : "";

  const party = DATA.parties.find((p) => p.truck && t.name.includes(p.truck.split(" ")[0]) || (p.truck && p.truck === t.name));
  const partyHtml = party
    ? `<a class="party-ticket" href="#/parties">🎪 Afterparty: ${esc(party.venue)} — ${esc(party.doors)} Uhr</a>`
    : "";

  $view.innerHTML = `
    <button class="back-btn" onclick="location.hash='#/'">← Alle Floats</button>
    <div class="detail-hero">
      <div class="detail-num">Float ${t.number ?? "—"}</div>
      <div class="detail-name">${esc(t.name)}</div>
      <div class="detail-section">📍 ${esc(t.section || "—")}</div>
      ${t.styles && t.styles.length ? `<div class="style-chips">${t.styles.map((s) => `<span class="style-chip">${esc(s)}</span>`).join("")}</div>` : ""}
      ${windowHtml}
    </div>
    ${slotsHtml}
    ${lineupHtml}
    ${t.desc ? `<div class="info-block"><h3>Über den Float</h3><p>${esc(t.desc)}</p></div>` : ""}
    ${socials ? `<div class="info-block"><h3>Links</h3><div class="social-row">${socials}</div></div>` : ""}
    ${partyHtml}
  `;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ── Parties view ─────────────────────────────────────── */
function renderParties() {
  const parties = [...DATA.parties].sort((a, b) =>
    (labelToMin(a.doors) ?? 9999) - (labelToMin(b.doors) ?? 9999));
  const official = parties.filter((p) => p.category === "official");
  const others = parties.filter((p) => p.category !== "official");

  let html = `<div class="section-title">Offizielle Afterparty</div>`;
  html += official.map(partyCard).join("") || '<div class="empty">—</div>';
  html += `<div class="section-title">Weitere Parties</div>`;
  html += others.map(partyCard).join("");

  $view.innerHTML = html;
}

function partyCard(p) {
  const tag = p.category === "official" ? '<span class="party-tag">Offiziell</span>' : "";
  const styles = p.styles && p.styles.length ? `<div style="margin-top:8px">${p.styles.slice(0, 4).map((s) => `<span class="style-chip">${esc(s)}</span>`).join("")}</div>` : "";
  const truckLink = p.truck ? `<div class="party-meta" style="margin-top:6px">🎶 Float: ${esc(p.truck)}</div>` : "";
  return `
  <div class="party-card">
    <div class="party-title">${esc(p.title)}${tag}</div>
    <div class="party-meta"><strong>${esc(p.venue || "—")}</strong>${p.area ? " · " + esc(p.area) : ""}</div>
    <div class="party-time">🕐 ${esc(p.doors || "?")} – ${esc(p.end || "?")} Uhr</div>
    ${truckLink}
    ${styles}
    ${p.ticketUrl ? `<a class="party-ticket" href="${esc(p.ticketUrl)}" target="_blank" rel="noopener">🎟 Tickets</a>` : ""}
  </div>`;
}

/* ── Now view ─────────────────────────────────────────── */
function renderNow() {
  const now = nowMinutes();
  const t = formatNow();
  const running = paradeRunning();

  let content = "";
  if (!running) {
    content = `<div class="empty"><div class="big">⏳</div>Parade läuft 14:00–22:00 Uhr.<br>Aktuell ist die Parade nicht aktiv.</div>`;
  } else {
    const active = activeSlots();
    if (active.length === 0) {
      content = `<div class="empty"><div class="big">🕺</div>Gerade keine Set-Zeiten veröffentlicht —<br>trotzdem ab auf die Straße!</div>`;
    } else {
      content = active.map(({ truck, slot }) => `
        <a class="now-float" href="#/truck/${encodeURIComponent(truck.id)}">
          <div class="truck-name">${esc(truck.name)}</div>
          <div class="artist">🎧 ${esc(slot.artist)}</div>
          <div class="slot-window">${esc(slot.start || "?")} – ${esc(slot.end || "?")} Uhr</div>
        </a>`).join("");
    }
  }

  $view.innerHTML = `
    <div class="now-hero">
      <div class="now-time">${t}</div>
      <div class="now-status">${running ? "Parade läuft! 🔥" : "Außerhalb des Parade-Fensters"}</div>
    </div>
    ${content}`;
}

function formatNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
  return parts;
}

function activeSlots() {
  const now = nowMinutes();
  const out = [];
  for (const t of DATA.trucks) {
    if (!t.hasSetTimes) continue;
    for (let i = 0; i < t.slots.length; i++) {
      const s = t.slots[i];
      const sMin = labelToMin(s.start);
      const eMin = s.end ? labelToMin(s.end)
        : (i + 1 < t.slots.length ? labelToMin(t.slots[i + 1].start) : labelToMin(t.windowEnd));
      if (sMin !== null && eMin !== null && now >= sMin && now < eMin) {
        out.push({ truck: t, slot: s });
      }
    }
  }
  return out;
}

/* ── Init ─────────────────────────────────────────────── */
function init() {
  loadData().then(() => {
    router();
    window.addEventListener("hashchange", router);
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.addEventListener("click", () => go(b.dataset.view === "list" ? "#/" : "#/" + b.dataset.view));
    });
    nowTimer = setInterval(() => {
      if (location.hash === "#/now") renderNow();
      else if (location.hash.startsWith("#/truck/")) {
        // re-render to refresh JETZT marker
        router();
      }
    }, 30000);
  });
}

document.addEventListener("DOMContentLoaded", init);
