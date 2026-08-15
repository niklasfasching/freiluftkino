import {css, html, render} from "https://x.niklasfasching.de/jsxy.mjs";

const today = new Date().setHours(0, 0, 0, 0);
const shows = Object.values(await fetch("shows.json").then(r => r.json()))
      .filter(s => s.timestamp >= today)
      .sort((a, b) => a.timestamp - b.timestamp);
const byId = Object.fromEntries(shows.map(s => [s.id, s]));
const cinemas = [...new Set(shows.map(s => s.cinemaShortName))].sort();
const filters = {q: "", original: false, english: false, bookable: false, starred: false,
                 picked: false, byFilm: false, hidden: new Set()};
let toast = "";

for (const s of shows) s.film = (s.normalizedTitle || s.title.toUpperCase()).trim() || s.title;
const films = {};
for (const s of shows) (films[s.film] ||= []).push(s);
const byHash = Object.fromEntries(Object.keys(films).map(f => [hash(f), f]));
const byIdHash = Object.fromEntries(shows.map(s => [hash(s.id), s.id]));

// stars are films you want to see, picks are screenings you're going to - the second is what
// ends up in a calendar, so both are kept and shared.
const load = (k, ok) => new Set(JSON.parse(localStorage.getItem(k) || "[]").filter(ok));
const stars = load("stars", f => films[f]);
const picks = load("picks", id => byId[id]);
const save = () => {
  localStorage.setItem("stars", JSON.stringify([...stars]));
  localStorage.setItem("picks", JSON.stringify([...picks]));
};

function draw(fresh) {
  const [path, ...rest] = location.search.slice(1).split("&");
  const params = Object.fromEntries(rest.map(s => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)]));
  const id = path.startsWith("/") ? decodeURIComponent(path.slice(1)) : "";
  const resolve = (v, m) => new Set((v || "").split(",").map(h => m[h]).filter(Boolean));
  const shared = (params.f || params.p) && {films: resolve(params.f, byHash), shows: resolve(params.p, byIdHash)};
  if (fresh) document.body.replaceChildren();
  render(id ? detail(byId[id], id) : list(shared), document.body);
}

addEventListener("popstate", () => draw(true));
document.body.addEventListener("click", (e) => {
  const href = e.target.closest("a")?.getAttribute("href");
  if (!href?.startsWith("?/") || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  history.pushState({}, "", href);
  scrollTo(0, 0);
  draw(true);
});
draw(true);

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// "open air: Porco Rosso OmeU, ab 6 (OmeU) (subtitled OV English / OmeU)" -> "Porco Rosso"
function title(s) {
  let t = s.title.replace(/^\s*open air:\s*/i, "").trim();
  for (let prev; prev !== t; ) {
    prev = t;
    t = t.replace(/\s*\([^()]*\)$/, "")
      .replace(/,?\s*ab \d+\.?$/i, "")
      .replace(/\s*[/,]\s*\S*(?:OmU|OmeU|OV|Ut\.?|Fassung)\S*$/i, "")
      .trim();
  }
  return t || s.title;
}

function matches(s, shared) {
  return (!filters.original || s.version?.original) &&
    (!filters.english || s.version?.english) &&
    (!filters.bookable || s.bookable !== false) &&
    (!filters.starred || stars.has(s.film)) &&
    (!filters.picked || picks.has(s.id)) &&
    (!shared || shared.films.has(s.film) || shared.shows.has(s.id)) &&
    !filters.hidden.has(s.cinemaShortName) &&
    s.film.includes(filters.q.toUpperCase());
}

function flash(msg) {
  toast = msg;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => (toast = "", draw()), 6000);
  draw();
}

// navigator.share only exists on mobile/safari, and clipboard writes can be denied - fall all the
// way back to showing the link so it can always be copied by hand.
async function shareLink(suffix, text) {
  const url = location.origin + location.pathname + suffix;
  const data = {title: "Freiluftkino", text, url};
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) return await navigator.share(data);
    await navigator.clipboard.writeText(url);
    flash("Link kopiert");
  } catch (e) {
    if (e.name !== "AbortError") flash(url);
  }
}

function shareShow(s) {
  return shareLink("?/" + encodeURIComponent(s.id),
                   `${title(s)} · ${s.date} ${s.time} · ${s.cinemaShortName}`);
}

function shareList() {
  const q = [stars.size && "f=" + [...stars].map(hash).join(","),
             picks.size && "p=" + [...picks].map(hash).join(",")].filter(Boolean).join("&");
  return shareLink("?/&" + q, `${stars.size} Filme, ${picks.size} Termine`);
}

// floating local time - the scraped timestamps carry berlin wall clock in their utc fields
function calendar() {
  const p = (n) => String(n).padStart(2, "0");
  const at = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
      `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
  };
  const esc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ls = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//freiluftkino//DE"];
  for (const id of picks) {
    const s = byId[id];
    if (!s) continue;
    ls.push("BEGIN:VEVENT", `UID:${id}@freiluftkino`,
            `DTSTAMP:${at(Date.now())}Z`, `DTSTART:${at(s.timestamp)}`, `DTEND:${at(s.timestamp + 72e5)}`,
            `SUMMARY:${esc(title(s))}`, `LOCATION:${esc(s.cinemaShortName)}`, `URL:${esc(s.url)}`,
            "END:VEVENT");
  }
  const url = URL.createObjectURL(new Blob([ls.concat("END:VCALENDAR").join("\r\n")], {type: "text/calendar"}));
  Object.assign(document.createElement("a"), {href: url, download: "freiluftkino.ics"}).click();
  URL.revokeObjectURL(url);
}

function list(shared) {
  const toggle = (k) => (filters[k] = !filters[k], draw());
  const toggleCinema = (c) => (filters.hidden.delete(c) || filters.hidden.add(c), draw());
  const toggleStar = (f) => (stars.delete(f) || stars.add(f), save(), draw());
  const togglePick = (id) => (picks.delete(id) || picks.add(id), save(), draw());
  const take = (sh) => {
    sh.films.forEach(f => stars.add(f));
    sh.shows.forEach(id => picks.add(id));
    save();
    history.pushState({}, "", "?/");
    draw(true);
  };
  const shown = shows.filter((s) => matches(s, shared));
  // by date answers "what's on tonight", by film answers "when can I see X" - same rows, one axis
  const groups = new Map();
  for (const s of shown) {
    const k = filters.byFilm ? "" : s.date;
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k);
    if (!g.has(s.film)) g.set(s.film, []);
    g.get(s.film).push(s);
  }
  return html`
    <.list>
      <header>
        <input .search type="search" placeholder="Film suchen..." value=${filters.q}
               oninput=${(e) => (filters.q = e.target.value, draw())}/>
        <.chips>
          <button .chip .on=${filters.original} onclick=${() => toggle("original")}>OmU</>
          <button .chip .on=${filters.english} onclick=${() => toggle("english")}>English</>
          <button .chip .on=${filters.bookable} onclick=${() => toggle("bookable")}>buchbar</>
          <button .chip .on=${filters.byFilm} onclick=${() => toggle("byFilm")}>nach Film</>
          ${!!stars.size && html`
            <button .chip .star .on=${filters.starred}
                    onclick=${() => toggle("starred")}>★ ${stars.size} Filme</>`}
          ${!!picks.size && html`
            <button .chip .star .on=${filters.picked}
                    onclick=${() => toggle("picked")}>★ ${picks.size} Termine</>`}
        </>
        <.chips .scroll>
          ${cinemas.map((c) => html`
            <button .chip .cinema .on=${!filters.hidden.has(c)}
                    onclick=${() => toggleCinema(c)}>${c}</>`)}
        </>
        <.planbar .on=${!!(stars.size || picks.size)}>
          <button onclick=${shareList}>Liste teilen</>
          <button disabled=${!picks.size} onclick=${calendar}>Kalender</>
        </>
      </header>
      <.toast .on=${!!toast}>${toast}</>
      ${shared && html`
        <.banner>
          <span>Geteilte Liste · ${shared.films.size} Filme · ${shared.shows.size} Termine</>
          <button onclick=${() => take(shared)}>übernehmen</>
          <a href="?/">alle anzeigen</a>
        </>`}
      <.count>${new Set(shown.map(s => s.film)).size} Filme · ${shown.length} Vorstellungen</>
      ${[...groups].map(([date, group]) => html`
        <section .day>
          <h2>${date || "alle Filme"}</h2>
          ${[...group].map(([film, ss]) => filmRow(film, ss, toggleStar, togglePick))}
        </>`)}
      ${!shown.length && html`<.empty>Keine Vorstellung passt zu den Filtern.</>`}
    </>`;
}

function filmRow(film, ss, toggleStar, togglePick) {
  const s = ss[0], img = ss.find(x => x.img)?.img, href = "?/" + encodeURIComponent(s.id);
  const venues = new Set(ss.map(x => x.cinemaShortName));
  const sub = [venues.size === 1 ? s.cinemaShortName : null, s.version?.raw].filter(Boolean).join(" · ");
  return html`
    <.film>
      <a .plink href=${href}>
        ${img ? html`<img .poster src=${img} alt="" loading="lazy"/>` : html`<.poster></>`}
      </a>
      <a .title href=${href}>${title(s)}</a>
      <button .star .on=${stars.has(film)} title="Film merken"
              onclick=${() => toggleStar(film)}>${stars.has(film) ? "★" : "☆"}</>
      ${sub && html`<.sub>${sub}</>`}
      <.times>
        ${ss.map((x) => html`
          <button .time .on=${picks.has(x.id)} .soldout=${x.bookable === false}
                  title="Termin merken" onclick=${() => togglePick(x.id)}>
            ${picks.has(x.id) ? "★ " : ""}${filters.byFilm ? x.date.replace(".,", "") + " " : ""}${x.time}${
              venues.size > 1 ? " " + x.cinemaShortName : ""}</>`)}
      </>
    </>`;
}

function detail(s, id) {
  if (!s) return html`
    <.detail>
      <a .back href="?/">← alle Vorstellungen</a>
      <.empty>Vorstellung ${id} gibt es nicht (mehr).</>
    </>`;
  const others = films[s.film].filter(x => x.id !== s.id);
  return html`
    <.detail>
      <.toast .on=${!!toast}>${toast}</>
      <a .back href="?/">← alle Vorstellungen</a>
      <h1>${title(s)}</h1>
      <.meta>
        <span>${s.date} · ${s.time}</>
        <a href=${s.cinemaUrl} target="_blank" rel="noreferrer">${s.cinemaShortName}</a>
        ${s.version?.raw && html`<span>${s.version.raw}</>`}
        ${s.available >= 0 && html`<span>${s.available} frei · ${s.reserved} belegt</>`}
      </>
      <.actions>
        <a .button href=${s.url} target="_blank" rel="noreferrer">
          ${s.bookable === false ? "ausverkauft" : "Tickets"}</a>
        <button .button .pick .on=${picks.has(s.id)}
                onclick=${() => (picks.delete(s.id) || picks.add(s.id), save(), draw())}>
          ${picks.has(s.id) ? "★ gemerkt" : "☆ merken"}</>
        <button .button .secondary onclick=${() => shareShow(s)}>teilen</>
        ${s.trailer && html`
          <a .button .secondary href=${s.trailer} target="_blank" rel="noreferrer">Trailer</a>`}
      </>
      ${!!others.length && html`
        <.more>
          <h2>Weitere Termine</h2>
          <.times>
            ${others.map((x) => html`
              <a .time .soldout=${x.bookable === false} href=${"?/" + encodeURIComponent(x.id)}>
                ${x.date} ${x.time} · ${x.cinemaShortName}</a>`)}
          </>
        </>`}
      ${s.img && html`<img .poster src=${s.img} alt="" loading="lazy"/>`}
      ${s.description && html`<p .description>${s.description}</p>`}
    </>`;
}

css`
  :root {
    --bg: #fff;
    --fg: #111;
    --dim: #666;
    --line: #e0e0e0;
    --accent: #b4001e;
    --star: #c98200;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a;
      --fg: #e8e8e8;
      --dim: #969aa3;
      --line: #2c3038;
      --accent: #ff6b81;
      --star: #ffc247;
    }
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0 auto;
    padding: 0 0.75rem 3rem;
    max-width: 40rem;
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.45 system-ui, sans-serif;
    overflow-x: hidden;
    -webkit-text-size-adjust: 100%;
  }

  a {
    color: inherit;
  }

  header {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 0.6rem 0 0.5rem;
    border-bottom: 1px solid var(--line);
    background: var(--bg);

    & .search {
      padding: 0.6rem 0.7rem;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--bg);
      color: inherit;
      font: inherit;
      font-size: 16px; /* < 16px makes ios zoom on focus */
    }
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.5rem;

    &.scroll {
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    &.scroll::-webkit-scrollbar {
      display: none;
    }
  }

  .chip {
    flex: none;
    min-height: 2rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: none;
    color: var(--dim);
    font: inherit;
    font-size: 0.85rem;
    white-space: nowrap;
    cursor: pointer;

    &.on {
      border-color: var(--accent);
      color: var(--accent);
    }

    &.cinema.on {
      border-color: var(--fg);
      color: var(--fg);
    }

    &.star.on {
      border-color: var(--star);
      color: var(--star);
    }
  }

  .planbar {
    display: none;
    gap: 0.4rem;
    margin-top: 0.5rem;

    &.on {
      display: flex;
    }

    & button {
      min-height: 2.25rem;
      padding: 0.35rem 0.9rem;
      border: 0;
      border-radius: 8px;
      background: var(--star);
      color: var(--bg);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;

      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
    }
  }

  .toast {
    display: none;
    position: fixed;
    left: 50%;
    bottom: 1.25rem;
    z-index: 3;
    max-width: calc(100% - 1.5rem);
    padding: 0.6rem 0.9rem;
    border-radius: 8px;
    background: var(--fg);
    color: var(--bg);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
    transform: translateX(-50%);
    user-select: all;

    &.on {
      display: block;
    }
  }

  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.75rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--star);
    border-radius: 8px;
    font-size: 0.9rem;

    & button {
      padding: 0.35rem 0.8rem;
      border: 1px solid var(--star);
      border-radius: 999px;
      background: none;
      color: var(--star);
      font: inherit;
      cursor: pointer;
    }

    & a {
      color: var(--dim);
    }
  }

  .count {
    padding: 0.6rem 0 0;
    color: var(--dim);
    font-size: 0.8rem;
  }

  .day > h2 {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 1.25rem 0 0.25rem;
    padding: 0.3rem 0;
    background: var(--bg);
    color: var(--dim);
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .film {
    display: grid;
    grid-template-columns: 2.75rem 1fr auto;
    gap: 0.15rem 0.6rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--line);

    & .plink {
      grid-row: 1 / span 3;
    }

    & .poster {
      display: block;
      width: 2.75rem;
      height: 4.125rem;
      border-radius: 3px;
      background: var(--line);
      object-fit: cover;
    }

    & .title {
      grid-column: 2;
      align-self: center;
      text-decoration: none;
    }

    & .star {
      grid-column: 3;
      grid-row: 1;
      align-self: center;
      min-width: 2.5rem;
      min-height: 2.5rem;
      padding: 0;
      border: 0;
      background: none;
      color: var(--dim);
      font-size: 1.35rem;
      line-height: 1;
      cursor: pointer;

      &.on {
        color: var(--star);
      }
    }

    & .sub {
      grid-column: 2 / -1;
      color: var(--dim);
      font-size: 0.8rem;
    }
  }

  .times {
    display: flex;
    flex-wrap: wrap;
    grid-column: 2 / -1;
    gap: 0.3rem;
    margin-top: 0.15rem;

    & .time {
      min-height: 2rem;
      padding: 0.3rem 0.55rem;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: none;
      color: inherit;
      font: inherit;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;

      &.on {
        border-color: var(--star);
        color: var(--star);
      }

      &.soldout {
        color: var(--dim);
        text-decoration: line-through;
      }
    }
  }

  .empty {
    padding: 2rem 0;
    color: var(--dim);
  }

  .detail {
    padding-top: 0.75rem;

    & .back {
      display: inline-block;
      padding: 0.5rem 0;
      color: var(--dim);
      font-size: 0.9rem;
      text-decoration: none;
    }

    & h1 {
      margin: 0.25rem 0 0.5rem;
      font-size: 1.3rem;
      line-height: 1.25;
    }

    & .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 0.75rem;
      color: var(--dim);
      font-size: 0.9rem;
    }

    & .more {
      margin-top: 1.5rem;

      & h2 {
        margin: 0 0 0.4rem;
        color: var(--dim);
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      & .times {
        grid-column: auto;
      }
    }

    & .poster {
      margin-top: 1.5rem;
      width: 100%;
      max-width: 18rem;
      border-radius: 6px;
    }

    & .description {
      white-space: pre-wrap;
    }
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .button {
    padding: 0.6rem 1.1rem;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: none;
    cursor: pointer;

    &.pick {
      border-color: var(--star);
      color: var(--star);
    }

    &.secondary {
      border-color: var(--line);
      color: var(--dim);
    }
  }
`;
