const cinemas = {
  kinoTicketsOnline: {
    fh_freiluftkino: ["Freiluftkino Friedrichshain", "fhain", "http://www.freiluftkino-berlin.de/eine_woche.php"],
    kb_freiluftkino: ["Freiluftkino Kreuzberg", "xberg", "http://www.freiluftkino-kreuzberg.de/index.php"],
    rb_freiluftkino: ["Freiluftkino Rehberge", "rehberge", "http://www.freiluftkino-rehberge.de/index.php"],
  },
  kinoHeld: {
    581: ["freiluftkino-insel-revier-suedost", "cassiopeia"],
    580: ["freiluftkino-hasenheide", "hasenheide"],
    2153: ["freiluftkino-pompeji-open-air-am-ostkreuz-berlin", "pompeji ostkreuz"],
    1839: ["central-kino-open-air", "central"],
    1657: ["b-ware-openair-fmp", "fmp"],
    2339: ["b-ware-openairprinzessinnengarten-kollektiv-neukoell", "prinzessinengärten"],
    1621: ["nomadenkino-berlin", "nomadenkino"],
    3033: ["mobile-kino-berlin", "mobile kino"],
  },
  yorck: {
    "sommerkino-kulturforum": ["sommerkino-kulturforum", "kulturforum"],
    "sommerkino-charlottenburg": ["sommerkino-schloss-charlottenburg", "schloss-charlottenburg"],
  },
  cinetixx: {
    2527240812: ["Freiluftbühne Weißensee", "weissensee"],
  }
};

(async () => {
  const showsByCinema = {};
  for (let [id, [name, shortName, url]] of Object.entries(cinemas.kinoTicketsOnline)) {
    console.log(name);
    showsByCinema[name] = await getKinoTicketsOnlineCinema(id, name, shortName, url);
  }
  for (let [id, [name, shortName]] of Object.entries(cinemas.kinoHeld)) {
    console.log(name);
    showsByCinema[name] = await getKinoheldCinema(id, name, shortName);
  }
  for (let [id, [name, shortName]] of Object.entries(cinemas.yorck)) {
    console.log(name);
    showsByCinema[name] = await getYorckCinema(id, name, shortName);
  }
  for (let [id, [name, shortName]] of Object.entries(cinemas.cinetixx)) {
    console.log(name);
    showsByCinema[name] = await getCinetixxCinema(id, name, shortName);
  }
  await writeFile("docs/showsByCinema.json", JSON.stringify(showsByCinema, null, 2));
  console.log("wrote docs/showsByCinema.json");
  const shows = Object.values(showsByCinema).flat().reduce((xs, x) => Object.assign(xs, {[x.id]: x}), {});
  await writeFile("docs/shows.json", JSON.stringify(shows, null, 2));
  console.log("wrote docs/shows.json");
  window.close(0);
})();


async function getCinetixxCinema(cinemaId, cinemaName, cinemaShortName) {
  const cinemaUrl = "https://booking.cinetixx.de/frontend/#/program/" + cinemaId
  const document = await getDocument("https://booking.cinetixx.de/Program?cinemaId=" + cinemaId);
  const shows = [];
  for (const el of document.querySelectorAll(".row.event")) {
    const isNonMovie = el.querySelector(".details").innerHTML.includes("Verleih: -Keine Angabe-");
    if (isNonMovie) continue;
    for (const showTime of [...el.querySelectorAll(".date-picker-table span[ui-sref]")]) {
      const showId = showTime.getAttribute("ui-sref").match(/showId: (\d+)/)[1]
      const show = await fetch(`https://booking.cinetixx.de/api/shows/${showId}/`)
        .then(r => r.json());
      const date = new Date(show.displayDateTime+"+00:00");
      const sectors = await fetch(`https://booking.cinetixx.de/api/shows/${showId}/sectors`)
        .then(r => r.json());
      let available = 0, reserved = 0;
      for (const sector of sectors) {
        const data = await fetch(`https://booking.cinetixx.de/api/shows/${showId}/sector/${sector.id}`)
          .then(r => r.json())
        available += data.seatCountFree;
        reserved += data.seatCountTotal - data.seatCountFree;
      }

      shows.push({
        cinemaId,
        cinemaUrl,
        cinemaName,
        cinemaShortName,
        id: cinemaShortName + "-" + date.getTime(),
        url: show._UrlBooking,
        date: formatDate(date),
        timestamp: date.getTime(),
        time: `${date.getUTCHours()}:${date.getUTCMinutes()}`,
        title: show.showName,
        version: getVersion(show.showName),
        normalizedTitle: normalizeTitle(show.showName),
        img: el.querySelector("img").src,
        description: el.querySelector(".movie-details div").innerText.trim(),
        trailer: el.querySelector("trailer-button")?.getAttribute("trailer-url").slice(1, -1),
        available,
        reserved,
        bookable: available > 0,
      });
    }
  }
  return shows;
}

async function getKinoheldCinema(cinemaId, cinemaName, cinemaShortName) {
  const result = await fetch(`https://www.kinoheld.de/ajax/getShowsForCinemas?cinemaIds[]=${cinemaId}`).then(r => r.json());
  return Promise.all(result.shows.map(async (show) => {
    const seatResult = await fetch("https://www.kinoheld.de/ajax/getSeats", {
      headers: {"Content-Type": "multipart/form-data; boundary=-boundary-"},
      body: [
        `--`,
        `\r\nContent-Disposition: form-data; name="cid"\r\n\r\n${cinemaId}\r\n--`,
        `\r\nContent-Disposition: form-data; name="showId"\r\n\r\n${show.id}\r\n--`,
        `\r\nContent-Disposition: form-data; name="mode"\r\n\r\n\r\n--`,
        `\r\nContent-Disposition: form-data; name="ref"\r\n\r\n\r\n--`,
        `\r\nContent-Disposition: form-data; name="rb"\r\n\r\n\r\n--`,
        `--\r\n`
      ].join("-boundary-"),
      method: "POST",
    }).then(r => r.status < 400 ? r.json() : {});
    const hasSeatSelection = seatResult.seat_selection_available;
    const seatMap = Object.values(seatResult.seats || []).reduce((acc, e) => acc.set(e.status, (acc.get(e.status) || 0) + 1), new Map());
    const bookable = seatResult.sectors?.some(s => s.availableSeats.order || s.availableSeats.reservation) || false;
    const movie = result.movies[show.movieId];
    const title = `${show.name} ${show.flags.length ? `(${show.flags.map(flag => flag.name).join(" / ")})` : ""}`;
    return {
      cinemaId,
      cinemaUrl: `https://www.kinoheld.de/kino-berlin/${cinemaName}/shows/movies`,
      cinemaName,
      cinemaShortName,
      id: cinemaShortName + "-" + show.id,
      title,
      normalizedTitle: normalizeTitle(title),
      version: getVersion(title),
      date: formatDate(new Date(show.date)),
      timestamp: new Date(show.date + " UTC").getTime(),
      time: show.time,
      url: `https://www.kinoheld.de/cinema-berlin/${cinemaName}/show/${show.id}?layout=shows`,
      img: movie?.largeImage,
      description: movie?.description,
      trailer: movie?.trailers?.[0]?.url,
      available: hasSeatSelection ? seatMap.get("sf") || 0 : bookable ? -1 : 0,
      reserved: hasSeatSelection ? seatMap.get("ss") || 0 : 0,
      bookable,
    };
  }));
}

async function getYorckCinema(cinemaId, cinemaName, cinemaShortName) {
  const cinemaUrl = "https://www.yorck.de/kinos/" + cinemaId;
  const document = await getDocument(cinemaUrl);
  const data = JSON.parse(document.querySelector("#__NEXT_DATA__").innerHTML);

  const shows = data.props.pageProps.filmsSpecials.flatMap(fs => {
    if (fs.fields.title === "Sommerkino 2022") {
      return [];
    }
    return fs.fields.sessions.map(s => {
      const date = new Date(s.fields.startTime.split("+")[0]+"+00:00");
      return {
        cinemaId,
        cinemaUrl,
        cinemaName,
        cinemaShortName,
        id: cinemaShortName + "-" + date.getTime(),
        title: fs.fields.title,
        normalizedTitle: normalizeTitle(fs.fields.title),
        version: getVersion(fs.fields.title),
        date: formatDate(date),
        timestamp: date.getTime(),
        time: `${date.getUTCHours()}:${date.getUTCMinutes()}`,
        url: "https://www.yorck.de/filme/" + fs.fields.slug,
      };
    });
  });

  const movies = {};
  for (const show of shows) {
    if (!movies[show.url]) {
      const document = await getDocument(show.url);
      const data = JSON.parse(document.querySelector("#__NEXT_DATA__").innerHTML);
      if (!data.props.pageProps.filmDecyled) {
        console.log(`Skipping ${show.url}: Missing movie info`);
        continue;
      }
      const filmData = JSON.parse(data.props.pageProps.filmDecyled);
      const trailerYouTubeId = filmData.fields.trailer1YouTubeId;
      movies[show.url] = {
        description: filmData.fields.synopsis,
        img: filmData.fields.poster?.fields.file.url,
        trailer: trailerYouTubeId && "https://www.youtube.com/watch?v=" + trailerYouTubeId,
        bookable: true,
      };
    }
    Object.assign(show, movies[show.url]);
  }
  return shows;
}

async function getKinoTicketsOnlineCinema(cinemaId, cinemaName, cinemaShortName, cinemaIndexUrl) {
  const index = await getDocument(cinemaIndexUrl), meta = {};
  for (const el of [...index.querySelectorAll(".lazyload")]) {
    el.innerHTML = el.firstChild.textContent; // <span class=lazyload><!-- $html --></span>
    const id = el.querySelector("a[href*=kinotickets-online]")?.href?.match(/\/(\d+$)/)[1];
    meta[id] = {
      trailer: el.querySelector("a[data-fancybox]")?.href,
      description: el.querySelector(".teasertext").innerText,
    };
  }
  const cinemaUrl = `https://kinotickets-online.com/${cinemaId}`;
  const d = await getDocument(cinemaUrl);
  return Promise.all([...d.querySelectorAll("main > div > ul > li")].map(async (li) => {
    const id = li.querySelector(`a[href*="/booking/"]`).href.match(/\/(\d+$)/)[1];
    const trailerUrl = li.querySelector(`a[href*="youtube"]`)?.href;
    const url = `https://kinotickets-online.com/${cinemaId}/sale/seats/${id}`;
    const movieId = li.querySelector("img").src.match(/movieId=(\d+)/)[1];
    const [_, day, month, time] = li.querySelector("ul li").innerText.match(/(\d+)\.(\d+)\s*(\d+:\d+)/m);
    const date = new Date(`${new Date().getFullYear()}-${month}-${day} ${time} UTC`);
    const d = await getDocument(url);
    const title = li.querySelector(".font-bold.text-primary").innerText;
    return Object.assign({}, meta[id], {
      cinemaId,
      cinemaUrl,
      cinemaName,
      cinemaShortName,
      id: cinemaShortName + "-" + id,
      url,
      img: `https://kinotickets-online.com/${cinemaId}/assets/poster?movieId=${movieId}`,
      trailer: trailerUrl,
	  title,
      normalizedTitle: normalizeTitle(title),
      version: getVersion(title),
      date: formatDate(date),
      timestamp: date.getTime(),
      time,
      available: d.querySelectorAll("#__seats-container button").length,
      reserved: d.querySelectorAll("#__seats-container [class*=bg-seat-res]").length,
      bookable: !d.body.textContent.includes("Diese Vorstellung ist leider ausverkauft!"),
    });
  }));
}

async function getDocument(url) {
  const html = await fetch(url).then(r => r.text());
  return new DOMParser().parseFromString(html, "text/html");
}

function formatDate(date) {
  return date.toLocaleTimeString("de-DE",  { weekday: "short", month: "2-digit", day: "2-digit", }).slice(0,10);
}

function normalizeTitle(title) {
  return title.toUpperCase().replace(/\(.*\)|-.*?film preview|open air:/ig, "").trim();
}

function getVersion(title) {
  return /\b(Ome?U|subtitled?)\b/i.test(title) ? "subtitled" : "normal";
}
