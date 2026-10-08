
const EDGE = {
  events: [],
  markets: [],
  edges: [],
  movers: [],
  racing: [],
  stats: {},
  live: false
};

function isNum(v) {
  return v !== null && v !== undefined && v !== "" &&
    Number.isFinite(Number(v));
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function pct(v, d = 1) {
  return isNum(v) ? (Number(v) * 100).toFixed(d) + "%" : "—";
}

function pp(v, d = 1) {
  return isNum(v) ? Number(v).toFixed(d) + " pp" : "—";
}

function price(v) {
  return isNum(v) && Number(v) > 1
    ? Number(v).toFixed(2)
    : "—";
}

function ev(v) {
  return isNum(v) ? (Number(v) * 100).toFixed(1) + "%" : "—";
}

function eventMap(d) {
  return new Map((d.events || []).map(x => [x.id, x]));
}

function modelled(d) {
  return (d.markets || []).filter(
    x => isNum(x.model_probability)
  );
}

function getMarketCountForEvent(d, eventId) {
  return new Set(
    (d.markets || [])
      .filter(m => m.event_id === eventId)
      .map(m => `${m.market_key}|${m.line ?? ""}`)
  ).size;
}

/*
 * Convert The Odds API response into the structure
 * expected by the Edge Lab Sports pages.
 */
function normaliseData(raw) {
  if (!raw || !Array.isArray(raw.events)) {
    return { ...EDGE };
  }

  const rawEvents = raw.events;
  const events = rawEvents.map(e => ({
    id: e.id,
    sport: e.sport_title || e.sport || e.sport_key || "Other",
    sport_key: e.sport_key || "",
    league: e.sport_title || e.league || e.sport_key || "Other",
    home: e.home_team || e.home || "",
    away: e.away_team || e.away || "",
    commence_time: e.commence_time || "",
    bookmakers: e.bookmakers || []
  }));

  const bestPrices = new Map();

  for (const event of events) {
    for (const bookmaker of event.bookmakers) {
      for (const market of (bookmaker.markets || [])) {
        for (const outcome of (market.outcomes || [])) {
          const marketKey = market.key || market.name || "unknown";
          const point = isNum(outcome.point)
            ? Number(outcome.point)
            : null;

          // Opposing spread lines share the same absolute line.
          const line = marketKey === "spreads" && point !== null
            ? Math.abs(point)
            : point;

          const groupKey = [
            event.id,
            marketKey,
            line ?? ""
          ].join("|");

          const selectionKey = [
            groupKey,
            outcome.name || "",
            point ?? ""
          ].join("|");

          const odds = Number(outcome.price);
          if (!Number.isFinite(odds) || odds <= 1) continue;

          const existing = bestPrices.get(selectionKey);

          if (!existing || odds > existing.best_price) {
            bestPrices.set(selectionKey, {
              event_id: event.id,
              market_key: marketKey,
              market: market.name || marketKey,
              selection: outcome.name || "Unknown",
              point,
              line,
              best_price: odds,
              bookmaker: bookmaker.title || bookmaker.key || "Unknown",
              commence_time: event.commence_time,
              model_probability: null,
              edge_probability_points: null,
              expected_value: null,
              confidence: null
            });
          }
        }
      }
    }
  }

  const markets = Array.from(bestPrices.values());

  // Calculate a market-implied probability estimate by removing
  // the overround from the best available prices for each line.
  // This is not a model probability or a betting recommendation.
  const groups = new Map();

  for (const market of markets) {
    const groupKey = [
      market.event_id,
      market.market_key,
      market.line ?? ""
    ].join("|");

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(market);
  }

  for (const group of groups.values()) {
    const totalImplied = group.reduce(
      (sum, item) => sum + 1 / item.best_price,
      0
    );

    if (totalImplied > 0) {
      for (const item of group) {
        item.implied_probability = 1 / item.best_price;
        item.market_fair_probability =
          item.implied_probability / totalImplied;
      }
    }
  }

  const sportNames = new Set(
    events.map(e => e.sport).filter(Boolean)
  );

  const errors = Array.isArray(raw.errors) ? raw.errors : [];

  return {
    schema_version: "1.0.0",
    updated_at: raw.generated_at || raw.updated_at || null,
    source: raw.source || "The Odds API",
    live: events.length > 0,
    data_status: raw.data_status || (
      errors.length ? "partial" : "success"
    ),
    errors,
    events,
    markets,
    edges: [],
    movers: [],
    racing: [],
    stats: {
      events: events.length,
      markets: groups.size,
      edges: 0,
      avg_edge: null,
      sports: sportNames.size,
      meetings: 0
    }
  };
}

async function loadEdgeData() {
  const paths = [
    "data/edge-data.json",
    "./data/edge-data.json"
  ];

  for (const path of paths) {
    try {
      const response = await fetch(path + "?" + Date.now(), {
        cache: "no-store"
      });

      if (!response.ok) continue;

      const raw = await response.json();
      const data = normaliseData(raw);

      if (data.live || raw.events) return data;
    } catch (error) {
      console.warn("Could not load " + path, error);
    }
  }

  return { ...EDGE };
}

function renderNavStatus(d) {
  document.querySelectorAll("[data-live]").forEach(el => {
    if (d.live) {
      el.textContent = d.data_status === "partial"
        ? "LIVE DATA · PARTIAL"
        : "DATA LIVE";
    } else {
      el.textContent = "DATA PENDING";
    }
  });
}

async function pageLoad(kind) {
  const d = await loadEdgeData();
  renderNavStatus(d);

  if (kind === "index") renderHome(d);
  if (kind === "edges") renderEdges(d);
  if (kind === "events") renderEvents(d);
  if (kind === "sports") renderSports(d);
  if (kind === "racing") renderRacing(d);
  if (kind === "movers") renderMovers(d);
  if (kind === "watchlist") renderWatchlist(d);
}

function renderHome(d) {
  const st = d.stats || {};

  const nums = [
    st.events ?? 0,
    st.markets ?? 0,
    st.edges ?? 0,
    st.avg_edge == null ? "—" : pp(st.avg_edge),
    st.sports ?? 0,
    st.meetings ?? 0
  ];

  document.querySelectorAll("[data-kpi]").forEach((el, i) => {
    el.textContent = nums[i] ?? "—";
  });

  const el = document.getElementById("homeEdges");
  if (!el) return;

  const rows = modelled(d)
    .filter(x => isNum(x.edge_probability_points))
    .sort((a, b) =>
      b.edge_probability_points - a.edge_probability_points
    )
    .slice(0, 12);

  const map = eventMap(d);

  el.innerHTML = rows.length
    ? rows.map(x => {
        const event = map.get(x.event_id) || {};
        return `
          <tr>
            <td>${esc((event.home || "") + " v " + (event.away || ""))}</td>
            <td>${esc(x.market)} · ${esc(x.selection)}</td>
            <td>${price(x.best_price)}</td>
            <td>${pct(x.model_probability)}</td>
            <td>${pct(x.market_fair_probability)}</td>
            <td class="green">${pp(x.edge_probability_points)}</td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="6" class="muted">
        ${d.live
          ? "Live odds are connected. Model probabilities are not configured yet, so no calculated betting edges are shown."
          : "No live data loaded. Check the data update workflow."}
      </td></tr>`;
}

function renderEdges(d) {
  const map = eventMap(d);
  const el = document.getElementById("edgeRows");
  if (!el) return;

  const rows = modelled(d)
    .filter(x => isNum(x.edge_probability_points))
    .sort((a, b) =>
      b.edge_probability_points - a.edge_probability_points
    );

  el.innerHTML = rows.length
    ? rows.map(x => {
        const event = map.get(x.event_id) || {};
        return `
          <div class="data-row">
            <span>${esc((event.home || "") + " v " + (event.away || ""))}</span>
            <span>${esc(x.market)} · ${esc(x.selection)}</span>
            <span>${price(x.best_price)}</span>
            <span>${pct(x.model_probability)}</span>
            <span>${pp(x.edge_probability_points)}</span>
            <b class="green">${esc(x.confidence || "—")}</b>
          </div>`;
      }).join("")
    : `<div class="empty">
        ${d.live
          ? "Live odds are available, but validated sport-specific probability models have not been connected. No betting edges are being claimed."
          : "No live odds loaded. Check the automated data update."}
      </div>`;
}

function renderEvents(d) {
  const el = document.getElementById("eventRows");
  if (!el) return;

  const events = (d.events || []).slice().sort((a, b) =>
    String(a.commence_time).localeCompare(String(b.commence_time))
  );

  el.innerHTML = events.map(event => `
    <div class="data-row">
      <span>${esc(event.league || event.sport || "")}</span>
      <span>${esc(event.home || "")} v ${esc(event.away || "")}</span>
      <span>${esc(event.commence_time || "")}</span>
      <b>${getMarketCountForEvent(d, event.id)}</b>
    </div>
  `).join("") || `<div class="empty">No live events loaded.</div>`;
}

function renderSports(d) {
  const counts = {};

  (d.events || []).forEach(event => {
    const sport = event.sport || "Other";
    if (!counts[sport]) counts[sport] = { events: 0, keys: new Set() };

    counts[sport].events++;
    (d.markets || [])
      .filter(m => m.event_id === event.id)
      .forEach(m => counts[sport].keys.add(
        `${m.market_key}|${m.line ?? ""}`
      ));
  });

  const el = document.getElementById("sportRows");
  if (!el) return;

  el.innerHTML = Object.entries(counts)
    .sort((a, b) => b[1].events - a[1].events)
    .map(([sport, data]) => `
      <div class="card">
        <small>SPORT</small>
        <b>${esc(sport)}</b>
        <span>${data.events} events · ${data.keys.size} market groups</span>
      </div>
    `).join("") || `<div class="empty">No sports data loaded.</div>`;
}

function renderRacing(d) {
  const el = document.getElementById("racingRows");
  if (!el) return;

  el.innerHTML = (d.racing || []).length
    ? d.racing.map(x => `
        <div class="data-row">
          <span>${esc(x.meeting || "")}</span>
          <span>${esc(x.race || "")}</span>
          <span>${esc(x.runner || "")}</span>
          <span>${price(x.price)}</span>
          <b>${pp(x.edge_probability_points)}</b>
        </div>
      `).join("")
    : `<div class="empty">
        Racing data provider not connected yet. Live sports odds are the first data layer.
      </div>`;
}

function renderMovers(d) {
  const el = document.getElementById("moverRows");
  if (!el) return;

  el.innerHTML = (d.movers || []).map(x => `
    <div class="data-row">
      <span>${esc(x.selection || "")}</span>
      <span>${esc(x.bookmaker || "")}</span>
      <span>${price(x.old_price)} → ${price(x.new_price)}</span>
      <b>${esc(x.change_pct ?? "—")}%</b>
    </div>
  `).join("") || `<div class="empty">
      Price movement history will populate after consecutive odds snapshots.
    </div>`;
}

function renderWatchlist(d) {
  const el = document.getElementById("watchRows");
  if (!el) return;

  el.innerHTML = `<div class="empty">
    Watchlist storage will be added after the live market schema is stable.
  </div>`;
}
