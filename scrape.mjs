const cinemas = {
  kinoTicketsOnline: {
    fh_freiluftkino: "Freiluftkino Friedrichshain",
    kb_freiluftkino: "Freiluftkino Kreuzberg",
    rb_freiluftkino: "Freiluftkino Rehberge",
  },
  kinoHeld: {
    581: "freiluftkino-insel-im-cassiopeia",
    580: "freiluftkino-hasenheide",
    2153: "freiluftkino-pompeji-open-air-am-ostkreuz-berlin",
    1839: "central-kino-open-air",
    1657: "b-ware-openair-fmp",
    2339: "b-ware-openairprinzessinnengarten-kollektiv-neukoell",
  },
};

(async () => {
  try {
    const showsByCinema = {};
    for (let [id, name] of Object.entries(cinemas.kinoTicketsOnline)) {
      console.log(name);
      showsByCinema[name] = await getKinoTicketsOnlineCinema(id, name);
    }
    for (let [id, name] of Object.entries(cinemas.kinoHeld)) {
      console.log(name);
      showsByCinema[name] = await getKinoheldCinema(id, name);
    }
    await fetch("/create?path=docs/showsByCinema.json", {method: "POST", body: JSON.stringify(showsByCinema, null, 2)});
    console.info("wrote docs/showsByCinema.json");
    if (!window.args.includes("dev")) console.clear(0);
  } catch(err) {
    console.error(err);
    if (!window.args.includes("dev")) console.clear(1);
  }
})();

async function getKinoheldCinema(cinemaId, cinemaName) {
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
    const seatMap = Object.values(seatResult.seats || []).reduce((acc, e) => acc.set(e.status, (acc.get(e.status) || 0) + 1), new Map());
    const bookable = seatResult.sectors?.some(s => s.availableSeats.order || s.availableSeats.reservation) || false;
    return {
      cinemaId,
      cinemaUrl: `https://www.kinoheld.de/kino-berlin/${cinemaName}/shows/movies`,
      cinemaName,
      title: `${show.name} ${show.flags.length ? `(${show.flags.map(flag => flag.name).join(" / ")})` : ""}`,
      date: formatDate(new Date(show.date)),
      timestamp: new Date(show.date + " UTC").getTime(),
      time: show.time,
      url: `https://www.kinoheld.de/cinema-berlin/${cinemaName}/show/${show.id}?layout=shows`,
      img: result.movies[show.movieId]?.lazyImage,
      available: seatMap.get("sf"),
      reserved: seatMap.get("ss"),
      bookable,
    };
  }));
}

async function getKinoTicketsOnlineCinema(cinemaId, cinemaName) {
  const cinemaUrl = `https://kinotickets-online.com/${cinemaId}`;
  const d = await getDocument(cinemaUrl);
  return Promise.all([...d.querySelectorAll("main > div > ul > li")].map(async (li) => {
    const id = li.querySelector("a").href.match(/\/(\d+$)/)[1];
    const url = `https://kinotickets-online.com/${cinemaId}/seats/${id}`;
    const movieId = li.querySelector("img").src.match(/movieId=(\d+)/)[1];
    const [_, day, month, time] = li.querySelector("ul li").innerText.match(/(\d+)\.(\d+)\s*(\d+:\d+)/m);
    const date = new Date(`${new Date().getFullYear()}-${month}-${day} ${time} UTC`);
    const d = await getDocument(url);
    return {
      cinemaId,
      cinemaUrl,
      cinemaName,
      id,
      url,
      img: `https://kinotickets-online.com/${cinemaId}/poster?movieId=${movieId}`,
	  title: li.querySelector(".font-bold.text-primary").innerText,
      date: formatDate(date),
      timestamp: date.getTime(),
      time,
      available: d.querySelectorAll("#__seats-container button").length,
      reserved: d.querySelectorAll("#__seats-container .bg-seat-res").length,
      bookable: !d.body.textContent.includes("Diese Vorstellung ist leider ausverkauft!"),
    };
  }));
}

async function getDocument(url) {
  const html = await fetch(url).then(r => r.text());
  return new DOMParser().parseFromString(html, "text/html");
}

function formatDate(date) {
  return date.toLocaleTimeString("de-DE",  { weekday: "short", month: "numeric", day: "numeric", }).slice(0,10);
}
