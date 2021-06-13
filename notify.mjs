// niklasfasching/github-action-telegram-subscriptions
import {readFileSync} from "fs" ;

export async function updateSubscription(chatID, {config, state}, telegram) {
  const lastUpdate = state.timestamp, now = Date.now();
  const shows = Object.values(JSON.parse(readFileSync("docs/showsByCinema.json"))).flat();
  const history = JSON.parse(readFileSync("docs/showHistory.json"));
  for (let showURL in history) {
    if (lastUpdate && lastUpdate > history[showURL][0]?.[0]) continue;
    const show = shows.find((show) => show.url === showURL);
    if (!show) continue;
    await telegram.sendMessage(chatID, `<a href="${show.url}"><b>${show.title}</b></a>
${show.date} ${show.time}, <a href="${show.cinemaUrl}">${show.cinemaShortName}</a>`);
    state.timestamp = now;
  }
}
