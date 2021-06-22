const cinemas = {
  kinoTicketsOnline: {
    fh_freiluftkino: ["Freiluftkino Friedrichshain", "fhain", "http://www.freiluftkino-berlin.de/eine_woche.php"],
    kb_freiluftkino: ["Freiluftkino Kreuzberg", "xberg", "http://www.freiluftkino-kreuzberg.de/index.php"],
    rb_freiluftkino: ["Freiluftkino Rehberge", "rehberge", "http://www.freiluftkino-rehberge.de/index.php"],
  },
  kinoHeld: {
    581: ["freiluftkino-insel-im-cassiopeia", "cassiopeia"],
    580: ["freiluftkino-hasenheide", "hasenheide"],
    2153: ["freiluftkino-pompeji-open-air-am-ostkreuz-berlin", "pompeji ostkreuz"],
    1839: ["central-kino-open-air", "central"],
    1657: ["b-ware-openair-fmp", "fmp"],
    2339: ["b-ware-openairprinzessinnengarten-kollektiv-neukoell", "prinzessinengärten"],
  },
};

(async () => {
  try {
    const showsByCinema = {};
    for (let [id, [name, shortName, url]] of Object.entries(cinemas.kinoTicketsOnline)) {
      console.log(name);
      showsByCinema[name] = await getKinoTicketsOnlineCinema(id, name, shortName, url);
    }
    for (let [id, [name, shortName]] of Object.entries(cinemas.kinoHeld)) {
      console.log(name);
      showsByCinema[name] = await getKinoheldCinema(id, name, shortName);
    }
    await fetch("/create?path=docs/showsByCinema.json", {method: "POST", body: JSON.stringify(showsByCinema, null, 2)});
    console.info("wrote docs/showsByCinema.json");
    if (!window.args.includes("dev")) console.clear(0);
  } catch(err) {
    console.error(err);
    if (!window.args.includes("dev")) console.clear(1);
  }
})();

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
    return {
      cinemaId,
      cinemaUrl: `https://www.kinoheld.de/kino-berlin/${cinemaName}/shows/movies`,
      cinemaName,
      cinemaShortName,
      id: "kinoheld-" + show.id,
      title: `${show.name} ${show.flags.length ? `(${show.flags.map(flag => flag.name).join(" / ")})` : ""}`,
      date: formatDate(new Date(show.date)),
      timestamp: new Date(show.date + " UTC").getTime(),
      time: show.time,
      url: `https://www.kinoheld.de/cinema-berlin/${cinemaName}/show/${show.id}?layout=shows`,
      img: movie?.lazyImage,
      description: movie?.description,
      trailer: movie?.trailers?.[0]?.url,
      available: hasSeatSelection ? seatMap.get("sf") || 0 : bookable ? -1 : 0,
      reserved: hasSeatSelection ? seatMap.get("ss") || 0 : 0,
      bookable,
    };
  }));
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
    const id = li.querySelector("a").href.match(/\/(\d+$)/)[1];
    const url = `https://kinotickets-online.com/${cinemaId}/seats/${id}`;
    const movieId = li.querySelector("img").src.match(/movieId=(\d+)/)[1];
    const [_, day, month, time] = li.querySelector("ul li").innerText.match(/(\d+)\.(\d+)\s*(\d+:\d+)/m);
    const date = new Date(`${new Date().getFullYear()}-${month}-${day} ${time} UTC`);
    const d = await getDocument(url);
    return Object.assign({}, meta[id], {
      cinemaId,
      cinemaUrl,
      cinemaName,
      cinemaShortName,
      id: "kinotickets-online-" + id,
      url,
      img: `https://kinotickets-online.com/${cinemaId}/poster?movieId=${movieId}`,
	  title: li.querySelector(".font-bold.text-primary").innerText,
      date: formatDate(date),
      timestamp: date.getTime(),
      time,
      available: d.querySelectorAll("#__seats-container button").length,
      reserved: d.querySelectorAll("#__seats-container .bg-seat-res").length,
      bookable: !d.body.textContent.includes("Diese Vorstellung ist leider ausverkauft!"),
    });
  }));
}

async function getDocument(url) {
  const html = await fetch(url).then(r => r.text());
  return new DOMParser().parseFromString(html, "text/html");
}

function formatDate(date) {
  return date.toLocaleTimeString("de-DE",  { weekday: "short", month: "numeric", day: "numeric", }).slice(0,10);
}
