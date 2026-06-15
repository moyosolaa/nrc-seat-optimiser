# NRC Lagos–Ibadan Seat Optimiser

A Chrome extension that helps passengers complete a Lagos–Ibadan rail journey by **split-ticketing on a single train** when the through-fare for their preferred class is sold out.

> **Status:** Technical plan / pre-build. This document is my own assessment and corrected design, written after reviewing the original `NRC-Seat-Optimiser-Technical-Plan.docx` and a set of real captured API requests/responses from `api.gsds.ng`. It supersedes the original plan where they disagree.

---

## TL;DR — my take

The original plan has a strong skeleton (clear user stories, sensible phases, an honest risk table) but rests on a few wrong assumptions that the real API captures and one key fact about the service correct. After those corrections the project gets **simpler, lower-risk, and better** than the doc imagined:

1. **It's one physical train.** The passenger never gets off. A "split" is a billing construct, not a transfer. This deletes the scariest failure mode (stranded mid-journey) and unlocks a premium feature: *keep one seat the entire way.*
2. **The data lives on `api.gsds.ng`, not `nrc.gsds.ng`.** The original interception design was scoped to the wrong host.
3. **The line has 9 stations, not 5**, and the station list must be read from the API at runtime, never hard-coded.
4. **One endpoint (`search-trips`) already returns everything the optimiser needs** — per-class seat counts and fares. The graph/DFS framing in the original doc is over-engineered; this is a tiny within-trip interval-partition problem.
5. **`declarativeNetRequest` cannot read response bodies.** Interception must be done by patching `fetch`/`XHR` in the page's MAIN world. The MV2 fallback proposed as a risk mitigation is dead and should be removed.

The honest strategic read: the extension itself has near-zero defensibility (NRC could ship this as a feature in a sprint) and lives in a ToS grey area. Its real value is **leverage for a formal data/partnership conversation with NRC/GSDS** — that should be stated as the business model, not buried as a "next step."

---

## The problem (reframed)

NRC sells point-to-point tickets on the Lagos–Ibadan Standard Gauge line. The passenger picks **any origin and any destination** on the line — A→E, A→D, B→E, whatever they need — and the tool engages whenever that journey spans **3 or more stations** (i.e. there is at least one intermediate station, so a split is possible at all). When the chosen origin→destination pair is sold out **in a given class**, the passenger sees a dead end — even though the *same train* often has seats available if the journey is bought as two or more consecutive segments.

Because the whole route is served by a **single train** — board at a set time and station, alight at your destination (you *must* get off where your ticket ends, even though the train rolls on to later stations) — the passenger:

- boards once, at their real origin, and **stays on the train** all the way to their destination — no getting off and re-boarding at intermediate stops, no connection to miss;
- arrives at exactly the same time the through-ticket would have delivered them;
- may have to **change seats at each split point** — each leg's ticket assigns its own, possibly different, seat, so the passenger moves seats when the train reaches each boundary station. Staying in one seat the whole way is just the lucky case where the same seat happens to be free across every leg.

**Worked example.** A passenger wants **A→D**, but the direct A→D ticket is sold out. The same train still has a free seat on each leg — A→B (seat 1), B→C (seat 5), C→D (seat 2) — so they buy all three, board at A in seat 1, move to seat 5 at B, move to seat 2 at C, and alight at D. One train, one continuous ride, two seat changes. That same A→D journey might *also* be coverable as **A→B + B→D**, or **A→C + C→D**, or the direct **A→D** if it frees up — each is a distinct **combination** with its own total price. There are many such scenarios; the job is to find every feasible one and rank them.

So the product is not "a complicated workaround." It's: **"You're already on this train the whole way — we just stitch the ticketing (and a seat hop or two) so you can ride when the through-fare is gone."**

---

## Scope — this phase

The passenger chooses **any origin and any destination** on the line; the tool engages whenever that journey spans **3+ stations** (so there is at least one intermediate station to split at). For that journey, the **only** deliverable right now is:

> **Enumerate every valid ticket combination that covers the journey, and show each with its total price — cheapest first. Nothing else.**

**In scope**
- **Fire only when the selected route is sold out.** If the direct origin→destination still has a seat (in the chosen class), the tool stays **dormant** and surfaces nothing — the passenger just books normally. The optimiser is a fallback, not an always-on overlay.
- **Recommend per daily trip.** A date has up to 3 trips (morning/afternoon/evening, sometimes 2); each is evaluated and presented **separately** — legs are never mixed across trips (one physical train per combination).
- Read the station list and per-segment availability + fares from the API.
- Enumerate all valid partitions of the journey into consecutive, directly-purchasable, available segments **on the same train**.
- Compute each combination's **total price**; rank **fewest tickets first** (price as tiebreaker); no ticket cap by default.
- For each leg, recommend the **coach + seat to buy** (from the seat map), keeping the same seat across a switch when it's free so the passenger only moves when they must.
- Present that list, read-only.

A combination is **feasible** iff every one of its legs has at least one available seat in an acceptable class — the per-segment `availableSeats` count from `search-trips` decides this. The specific seat per leg is a *recommendation* drawn from the `getAvailableSeats` seat map when captured; without it the combination is still listed, just without a seat number.

**Out of scope for now** (deferred to later phases; kept in this doc for context)
- Booking, deep-links, multi-step booking sequences.
- Class preference settings, onboarding, refresh UX, branding.

A journey between **adjacent** stations (2 stations, 1 hop) has no split to compute — only the direct ticket — so the optimiser simply doesn't engage there.

> **Scope wrinkle to resolve first:** producing "all combinations **with total price**" requires the fare + availability of every candidate *sub-segment* (e.g. for A→E you need A→C, C→E, B→D, … prices). None of those are present from the user's single A→E search. So this phase needs either a **bulk fare/segment endpoint** (if one exists) or a small number of **background `search-trips` calls** to gather them — which makes the auth/replay question (Open Questions #1) **blocking for this phase**, not a later concern.

---

## Verified API surface

All three endpoints are on the dedicated API host **`https://api.gsds.ng`**, under the `/search/` path prefix, and every response uses the same envelope:

```json
{ "status": 200, "message": null, "result": [ ... ], "errorMessages": null }
```

All three are **GET** requests with their parameters in the **URL query string** (the "request body" lines in the captures are just the query string re-pasted). That matters: identifying a relevant request needs only the URL — no request-body reading required.

| Endpoint | Purpose | Needed for |
|---|---|---|
| `GET /search/route-wise-stations` | Full ordered station list for a route (id, name, code, sequence) | Build the station graph once per session |
| `GET /search/search-trips?fromStation&toStation&travelDate&routeNumber=LI` | Trips for an O-D + date; each trip has `tripId`, times, and a `coaches[]` array with **per-class available seat counts and fares** | **Core** — route discovery & optimisation |
| `GET /search/getAvailableSeats?fromStation&toStation&tripId&coachTypeId` | Per-coach seat map (`seatNumber`, `row`, `column`, `booked`) for one leg + class | **Used** — per-leg coach + seat recommendation |

### Stations (route `LI`, in order)

| Seq | Code | Station | stationId |
|----|------|---------|-----------|
| 1 | MJS | Mobolaji Johnson — Ebute Metta | `004a3e07-0b8b-4963-a7da-d6ddda455237` |
| 2 | BRF | Babatunde Raji Fashola — Agege | `488cdf70-4045-4496-99da-87407cdadd5e` |
| 3 | LKJ | Lateef Kayode Jakande — Agbado | `7a84498b-70d1-42c7-84d3-984d636a4ed2` |
| 4 | PYO | Professor Yemi Oshinbajo — Kajola | `d46fc91e-3727-49f6-922a-3214bb03283f` |
| 5 | ORK | Olu Funmilayo Ransome-Kuti — Papalanto | `732d176d-6e4e-4c69-b6c1-bcb0d6ae51b8` |
| 6 | PWS | Professor Wole Soyinka — Abeokuta | `57d7d1f6-0d37-4c47-abf6-5549f87eef26` |
| 7 | AOO | Aremo Olusegun Osoba — Olodo | `cc0763d9-7968-44b4-a8dd-e41d21a1350c` |
| 8 | LA | Ladoke Akintola — Omi-Adio | `8a4a5c24-4b12-436e-8a8f-ca52818c4fa8` |
| 9 | OA | Obafemi Awolowo — Moniya | `ec4334a8-2c00-401f-a77e-fc2585fc55d3` |

> These IDs are recorded here for reference only. **The extension must fetch this list at runtime** — treat sequence/IDs as data, not constants. Note the API numbers stations **per route direction** (Omi-Adio is #8 on Lagos→Ibadan but #2 on Ibadan→Lagos), so stations are identified by stable `stationId` and the optimiser runs in **either direction**.

### Classes (coach types)

| Class | coachTypeId | Example adult fare (MJS→OA) | Seat layout (from seat maps) |
|---|---|---|---|
| First | `66742888-5bac-4aa0-ab82-167123a73f83` | ₦13,000 | 3-across |
| Business | `bf4112a2-1d6b-4d90-8bdf-d634039a49f3` | ₦6,500 | 4-across (cols 1,2,6,7) |
| Standard | `9abb16d9-f6e9-428a-b872-1721d4f40398` | ₦3,600 (₦3,000 child) | 5-across (cols 1,2,5,6,7) |

Note the "sold out" condition is **per class**: in the captured evening trip, First/Business were near-full while Standard had hundreds of seats. The optimiser reasons at the **(trip × class)** level.

---

## Data model

```ts
interface Station { id: string; code: string; name: string; seq: number }

interface ClassAvailability {
  coachTypeId: string
  className: 'First' | 'Business' | 'Standard'
  availableSeats: number
  fareAdult: number
  fareChild: number
}

interface Trip {
  tripId: string
  vehicleCode: string          // e.g. "LI1" (morning), "LI3" (evening)
  travelDate: string           // YYYY-MM-DD
  fromSeq: number; toSeq: number
  classes: ClassAvailability[]
}

// A purchasable building block: any O-D pair on a given trip, in a given class.
interface Segment {
  tripId: string
  fromSeq: number; toSeq: number
  coachTypeId: string
  availableSeats: number
  fare: number
}
```

### The one hard constraint that defines the whole problem

**Every segment in a proposed itinerary must share the same `tripId`.** That is the formal statement of "same physical train": the passenger **switches seats, never trains.** Combining legs from different trips would silently turn an on-board seat change into a real change of trains — a transfer-and-wait. The optimiser therefore works *inside a single trip*: choose the trip, then partition that trip's journey.

---

## The optimiser

Given a chosen `tripId`, an origin sequence `i`, a destination sequence `j`, and class preferences, the optimiser **enumerates every valid way** to cover `[i, j]` with **consecutive, purchasable, available** segments (no ticket cap by default; an optional `maxTickets` can cap) and ranks them **fewest tickets first, then by price**. Each leg needs only *a* free seat — the passenger switches seats between legs — so feasibility is decided by the per-segment seat count.

**Trigger (the dormant gate).** Before anything else, the optimiser checks the selected route. If a direct seat exists under the chosen class it returns `status: 'direct-available'`, `fired: false`, and does no work — the tool only engages when the direct selection is sold out. The result carries a `status` of `not-applicable` (journey < 3 stations), `direct-available` (a seat exists — dormant), `splits-found`, or `no-options` (sold out, nothing within the ticket cap).

When it does fire, this is a **layered shortest-path / interval partition on a line of ≤ 8 hops** — not a graph search. Build a small DAG over stations `i..j`; a directed edge `a → b` exists iff segment `(a, b)` on this trip has ≥ 1 available seat in an acceptable class, weighted by fare. Then pick paths with at most `MAX_TICKETS_PER_IDENTITY` edges.

```
buildEdges(trip, i, j, classPrefs):
  for a in i..j-1:
    for b in a+1..j:
      seg = availabilityFor(trip.tripId, a, b, classPrefs)   // from search-trips
      if seg and seg.availableSeats > 0:
        edge[a][b] = { tickets: 1, fare: seg.fare, class: seg.className }

allItineraries(i, j, maxTickets = ∞):
  // enumerate every path of ≤ maxTickets consecutive edges from i to j (no cap by default)
  // rank by ticket count, then total fare; ≤ 8 nodes ⇒ trivially instant
  // return the FULL ranked list (all combinations), fewest tickets first
```

### Objective function (ranking) — this phase

1. **Feasible** — every leg is directly purchasable and has ≥ 1 seat in an acceptable class. (Hard filter.)
2. **Fewest tickets** — primary sort.
3. **Fewest seat changes** — tiebreak within the same ticket count.
4. **Lowest total price** — final tiebreak.

Each trip shows the **top 10** by this ranking. The output is the **full list of valid combinations, each with its total price, fewest tickets first** (not just the single best). There is **no ticket cap by default** — NRC's real per-NIN limit lives in config but isn't enforced for now; pass `maxTickets` to cap. Seat-level concerns — holding one seat the whole way — are a later phase; see *Scope*.

### Seat recommendation & continuity (implemented)

`getAvailableSeats` is keyed by `fromStation`/`toStation`, so it reports which seats are free **on a specific leg**. The optimiser recommends a coach + seat per leg, **preferring to keep the previous leg's exact seat when it's still free** — so it only tells the passenger to move when that seat is taken ahead. `seatSwitches` then counts *real* moves, not ticket boundaries (keep the same seat across a split → not a switch). When no seat map is captured for a leg, the combination still lists, just without a specific seat (and switches fall back to one per boundary).

---

## Architecture (Chrome MV3)

```
┌─────────────────────── nrc.gsds.ng page ───────────────────────┐
│  page scripts ──fetch/XHR──▶ api.gsds.ng                        │
│        ▲                                                        │
│        │ (patched)                                              │
│  [ injected interceptor ]  ◀── runs in MAIN world, document_start
│        │ postMessage                                            │
│  [ content script ]  ◀── isolated world; UI host (shadow DOM) + broker
│        │ chrome.runtime messaging                               │
└────────┼───────────────────────────────────────────────────────┘
         ▼
  [ service worker ]  ── session cache, graph, (optional) staged segment queries
         │
  [ optimiser engine ] ── pure TS; interval-partition DP + seat-continuity
         │
  [ React sidebar ] ── injected in shadow DOM (style isolation)
```

### Interception — the part the original plan got wrong

- **`declarativeNetRequest` / `webRequest` cannot read response bodies.** They see URLs and headers only. They are useful here *only* as a cheap URL trigger, not as the data source.
- **Patching `window.fetch` from a content script does nothing** — content scripts run in an isolated JS world. The patch must run in the page's **MAIN world** (`"world": "MAIN"` content script, Chrome 111+, or an injected `<script>`), at **`document_start`**, *before* the page's own scripts load.
- **Patch both `fetch` and `XMLHttpRequest`** until we've confirmed which the site uses.
- **Match on host + path prefix**, not exact paths: `host === "api.gsds.ng" && path.startsWith("/search/")`, with the `{status, message, result, errorMessages}` envelope as a schema backstop. (The path naming is inconsistent — `search-trips` and `route-wise-stations` are kebab-case, `getAvailableSeats` is camelCase — so an over-strict exact-path matcher would be brittle.)
- **`host_permissions` must include `https://api.gsds.ng/*`** (and `https://nrc.gsds.ng/*` for UI injection).

### Two operating modes

| Mode | What it does | Trade-off |
|---|---|---|
| **Passive** (always on) | Only reads availability that the user's own searches already triggered | Most defensible; but only sees segments the user manually searches → a sold-out route shows "no options" |
| **Active** (built; auto) | On the first sold-out search, auto-fetches the in-between `search-trips` to build the splits (ranked, top 10 shown) | Surfaces real combinations on live data; automated querying of **public** endpoints, tied to a user action |

> **HAR-confirmed (June 2026):** there is **no bulk availability endpoint** — `search-trips` returns exactly one O-D per request, and the search/seat endpoints are **public** (no auth). So per-segment fetching is the only way to get sub-segment data, and ~8 adjacent-hop calls is the floor.

**How active mode works** (`src/active/plan.ts`, `src/inject/intercept.ts`, `src/content/main.tsx`):
1. **No auth needed.** A HAR of the live site confirmed `search-trips` / `getAvailableSeats` are **public GETs** — no token, no cookie (login is only required to *book*). So the sub-segment fetches are plain anonymous requests, identical to what any visitor's browser sends. (The interceptor still captures a real request's headers as a harmless fallback.)
2. **Staged, fewest-tickets-first.** `planSegments()` orders fetches so 2-ticket enablers (O→k, k→D) come first, then deeper pieces; the direct and anything cached are skipped.
3. **Per-trip, same-train anchoring.** A search returns up to 3 daily trips (morning/afternoon/evening); **each is optimised separately and combinations are never mixed across trips**. One sub-segment fetch populates *every* trip — each response's trips are matched by `vehicleCode` and filed under their trip, so leg-matching holds whether or not the API reuses tripIds.
4. **Auto-fired on the first sold-out search** — no button. Fetches the full segment set (concurrency 3, hard cap 40) so the **fewest-ticket / fewest-change / cheapest** options are always built; results stream in best-first as calls land, and each trip shows its **top 10**. (`planSegments` still has an `adjacentOnly` mode — the lean ~8-call floor — if request volume ever needs trimming.)
5. **Caching & freshness.** Fetched segments are **cached 5 minutes and reused across any O-D search** (persisted to `chrome.storage.local`, survives reloads); stale entries auto-re-fetch. The panel warns availability may be up to 5 min old and offers **"Refresh page"** for fresh data — so every fetch burst is tied to a user action, never a background poller.

> **ToS note:** active mode sends extra background requests to NRC — exactly what the ToS calls "automated means." It's opt-in and throttled by design, and is the kind of thing to disclose in a partnership conversation, not hide. It's also the live test of the same-`tripId` assumption.

---

## Constraints & configuration

| Setting | Default | Notes |
|---|---|---|
| `maxTicketsPerIdentity` | `4` (not enforced) | NRC's real per-NIN limit — in config but **off by default for now**; the optimiser ranks all combinations. Pass `maxTickets` to optimise() to cap. |
| Ranking | fewest tickets → price | Combinations ordered fewest tickets (fewest seat switches) first, cheapest within a tier. |
| `routeNumber` | `LI` | Lagos–Ibadan. |
| Data-freshness warning | 3 min | Show "last updated"; counts can go stale between view and booking. |

With 9 stations the full line is 8 hops, but since any O-D pair is directly purchasable, 4 tickets cover it comfortably — the cap is generous, not tight.

---

## Risks & mitigations (revised)

| Risk | Severity now | Mitigation |
|---|---|---|
| Stranded mid-journey | **Eliminated** | Same train; passenger never alights |
| Leg 2 sells out between bookings | Low–Med (fare penalty, not stranding) | Book the **scarcest leg first**; show live "availability may change" timestamp |
| Background querying looks like automation (ToS) | Med | Default to Passive mode; stage/throttle Active queries; lazy-widen only when cheaper options are exhausted |
| API shape changes | Med | Schema-tolerant parser keyed on the response envelope; alert on parse failure |
| Auth can't be replayed for Active mode | **Unknown — blocking for v2** | Capture one real `search-trips` request *with headers* and test replay |
| NRC ships this themselves / sends C&D | Med | Treat the extension as partnership leverage, not a moat; keep a clean, good-faith "user-initiated, read-only" posture |
| Chrome MV3 API changes break interception | Low–Med | Isolate the MAIN-world patch in one module; **drop the dead MV2 fallback** |

---

## Open questions to close before / during build

1. **Auth for replay — now blocking for this phase.** Does `api.gsds.ng` authenticate via `Authorization` header, cookie, or both? (Cross-origin subdomain, so cookie SameSite rules matter.) This phase's "all combinations + price" output depends on querying sub-segment fares, so this decides whether the phase is deliverable at all. → *capture one `search-trips` request with full headers.*
2. **fetch vs XHR.** Which does the site use? Decides what to patch. → *one DevTools look.*
3. **Stop confirmation.** Does the train actually stop at every intermediate sequence we'd split at? → proven when `search-trips` for the sub-segment returns the **same `tripId`**.
4. **Scope of the 4-ticket rule.** Confirmed per-NIN-per-trip; revisit if group/family booking enters scope (each NIN gets its own budget of 4).
5. **Booking/submit endpoints.** Not yet captured. Needed the moment we go past read-only suggestions into deep-linked booking.
6. **Bulk fare source?** Is there one endpoint that returns the full fare/segment matrix for a route (so we don't fire one `search-trips` per candidate sub-segment)? Worth hunting for before committing to N background calls — it's the cleanest way to deliver this phase.

---

## Delivery plan

Re-weighted from the original phases — the optimiser shrinks, interception robustness grows, and seat-continuity is added.

> **This phase = Phases 0–2 plus a read-only results list.** The current deliverable is just *combinations + total price, displayed*. Everything from booking/seat-continuity/prefs onward (Phases 3+) is explicitly deferred.

| Phase | Focus | Key deliverables |
|---|---|---|
| **0 — Recon** | Close the unknowns | Capture `search-trips` with headers; confirm fetch/XHR; verify same-`tripId` stops |
| **1 — Interception** | The hard, high-risk part | MAIN-world `fetch`+`XHR` patch at `document_start`; envelope-matched capture of `route-wise-stations` + `search-trips`; session cache; golden fixtures from real captures |
| **2 — Optimiser core** | Pure logic | Station graph from API; interval-partition DP over a single `tripId`; class filtering; ranked itineraries; full unit tests |
| **3 — Sidebar UI** | Surface it | Shadow-DOM React panel: direct vs split options, fares, seat counts, booking sequence, deep-links; correct "same train, maybe one seat change" copy |
| **4 — Seat continuity** | The upgrade | `getAvailableSeats` second pass; cross-leg seat intersection; "one seat all the way" result |
| **5 — Prefs & polish** | Round it out | Class preference, max-changes (capped at config), refresh, onboarding; Playwright e2e; Web Store submission |
| **(Gated) — Active mode** | Only if Phase 0 says auth is replayable | Background staged segment queries for zero-effort discovery |

The original "8–13 weeks solo" estimate is reasonable, but shift budget *out* of the optimiser (now trivial) and *into* Phases 0–1, which carry all the real uncertainty.

---

## Running it

```bash
cd ~/Desktop/nrc-seat-optimiser
npm install                 # one-time

# 1) Interactive browser demo — drive the optimiser by hand
npm run dev                 # → http://localhost:5173
#    Pick origin/destination, toggle "Direct route sold out", change class & ticket cap.
#    Sold out → ranked combinations with total price; seat available → tool stays dormant.

# 2) Tests + typecheck
npm test                    # 13 tests, incl. parsers vs the real captures
npm run typecheck

# 3) Build the Chrome extension
npm run build:ext           # → dist-ext/
#    chrome://extensions → enable Developer mode → "Load unpacked" → pick dist-ext/
#    then open https://nrc.gsds.ng and search a route.
```

The demo uses synthetic sub-segment fares (real ones aren't captured yet). The extension is **passive**: on the live site it only sees the page's own requests, so a sold-out route shows “no options yet” until active sub-segment querying is added — the gate, wiring, and rendering are all real.

## Implementation status

**Built and verified** — `npm test` → 13 passing, `tsc --noEmit` clean, demo rendered live in-browser:
- Domain model + GSDS envelope / `route-wise-stations` / `search-trips` / `getAvailableSeats` parsers, **tested against the real captures** in `fixtures/`.
- `AvailabilityProvider` + in-memory provider (segments + seat maps) — a **5-minute TTL cache**: entries reused across any O-D search, persisted to `chrome.storage.local`, auto-expire; stale → re-fetch. Panel advisory warns availability may be up to 5 min old.
- The optimiser: dormant-unless-sold-out gate (works **across all classes/coaches**), enumerate-every-combination, **fewest-tickets-first ranking** (no cap by default), class policy, **mixed-class flag**, **per-leg coach + seat recommendation with seat continuity**, ≥3-station guard.
- **Results UI** (`src/ui/ResultsPanel.tsx`) — **grouped per daily trip** (Morning/Afternoon/Evening, labelled from departure time); each trip shows its own dormant / split / no-options state. **Collapses to a small pill** so it never blocks the page. **Top 10 per trip**, ranked fewest tickets → fewest seat changes → lowest price. Minimal **scrollable** cards: price + ticket/change count + route, **tap to expand** per-leg class/coach/seat/fare; fewest-tickets & cheapest badges. Plus a **standalone browser demo** (`src/demo/`).
- **Extension shell** — `manifest.json`, MAIN-world interceptor wiring (`src/inject/`), content-script glue (`src/content/`), service worker (`src/background/`); `npm run build:ext` → loadable `dist-ext/`.
- **Dev-staging trace** (`src/ui/DebugPanel.tsx` + `explain()`) — click the status chip on the live page (or "Show optimiser trace" in the demo) to see the optimiser's reasoning: the verdict + *why*, which in-between segments are present/missing (✓/✗ with seat counts), the full captured-data inventory, and — when a sold-out route has no split — the **blocking leg** (a hop the train is full on that no captured through-ticket crosses, e.g. `⛔ PWS→ORK`). Also logged to the console on each search.

- **Active mode** (`src/active/`, interceptor + content-script orchestration) — opt-in "Fetch missing segments" button in the trace: clones a real request's auth, fetches in-between segments (throttled, capped, staged fewest-tickets-first), and rebuilds splits live. **Verified end-to-end on `nrc.gsds.ng`** — auth replay via captured XHR headers carries, sub-segments fetch, and real combinations build. (Confirms the site uses XHR, and that train-by-`vehicleCode` anchoring works.)

**Next:**
- Active seat-map fetching (active mode currently fetches fares/availability; seat numbers fill in only from seat maps the page already loaded).
- Per-train selection (active mode anchors on the first trip in the search results).

> Dev-tooling note: `npm audit` flags the esbuild→vite→vitest dev chain (dev/test only). React/React-DOM now ship in the UI bundle.

## Passive Twitter bot (`src/server/`, branch `passive-twitter-bot`)

A server-side bot that posts split-ticket options before departures. It's a clean fit because the HAR proved the search API is **public** — so a server calls it directly (no browser, no auth, no CORS), and the whole optimiser core is reused unchanged.

- **`nrcClient.ts`** — polite server-side client (one request at a time) for `route-wise-stations` + `search-trips`.
- **`gather.ts`** — server equivalent of active mode: fetch the direct O-D to learn the daily trips, and *only if a trip is sold out* fetch the in-between segments; optimise each trip separately. **Capped at 4 tickets** (NRC's `maxSeat`) so it never posts an un-bookable split.
- **`tweetFormat.ts`** — renders the best option per sold-out trip into a ≤280-char tweet; returns `''` (posts nothing) when seats are available.
- **`dryRun.ts`** — fetch live NRC data and **print** the tweet it would post (no X API, posts nothing).
- **`slots.ts`** — pure WAT time math for the 60/45/30/15-min posting windows.
- **`state.ts`** — JSON state (today's cached schedule + which slots are posted), committed back by the Action so timing checks cost zero NRC calls and nothing is double-posted.
- **`xClient.ts`** — X v2 poster (OAuth 1.0a); returns `null` with no keys → safe DRY mode.
- **`run.ts`** — the scheduled entry point (below).
- **`.github/workflows/bot.yml`** — runs `run.ts` every 5 min (06:00–16:00 WAT) and commits state.

```bash
npm run dry-run -- MJS OA              # print the tweet for one journey, today
npm run dry-run -- MJS OA 2026-06-18   # a specific date
npm run bot                            # the scheduled job once (DRY without X keys)
```

### Going live (free, post-only)
1. Create a free X developer app → generate the 4 OAuth 1.0a keys.
2. Add them as repo **Secrets**: `X_APP_KEY`, `X_APP_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`. (No keys = DRY mode: it logs the tweet instead of posting.)
3. Push to a **public** GitHub repo (Actions minutes are free) and enable Actions. Done — it posts split options before each departure when a route is sold out.

**Verified:** the pipeline reaches the public API server-side, parses the daily trips (2–3/day, both directions on route `LI`), caches the schedule, computes the windows, and only "posts" a sold-out-but-splittable train. The pure logic (slots, state, both formatters, the optimiser) is unit-tested.

**Caps & caveats:** capped at **4 tickets** (NRC's `maxSeat`); X **free write tier** ≈ 1,500/mo (we'd use ~300); GitHub cron **can be delayed** under load (Cloudflare Workers Cron is a more reliable free alternative if timing drifts); replying to mentions stays parked (needs a paid X read tier). And — as always — a public bot polling a government API is the most visible, ToS-exposed version; worth weighing vs. opening a partnership conversation first.

## Tech stack

- **Extension:** Chrome MV3, TypeScript
- **Build:** Vite (demo) + esbuild (extension bundle)
- **UI:** React 18 + plain CSS, injected into a **shadow DOM** for style isolation
- **State:** in-memory per page load (session-scoped); `chrome.storage.session` planned
- **Testing:** Vitest (unit, against real captured fixtures)
- **Quality:** TypeScript (strict mode)

## Proposed repo layout

```
nrc-seat-optimiser/
├─ src/
│  ├─ inject/        # MAIN-world fetch/XHR patch (document_start)
│  ├─ content/       # isolated content script: broker + shadow-DOM UI host
│  ├─ background/    # service worker: cache, graph, staged queries
│  ├─ optimiser/     # pure TS: interval-partition DP + seat continuity
│  ├─ ui/            # React sidebar (Tailwind, shadow DOM)
│  └─ shared/        # types, API envelope parser, station/class maps
├─ fixtures/         # real captured responses (search-trips, route-wise-stations, seat maps)
├─ tests/
└─ manifest.json
```

---

*Planning document. Reflects analysis of the original technical plan plus real `api.gsds.ng` captures, as of June 2026. Not code; no implementation has started.*
