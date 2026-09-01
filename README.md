# Blockbuster: The Movie Game

A free browser tribute to the [Blockbuster party game](https://en.wikipedia.org/wiki/Blockbuster_(party_game)).
Play it hotseat-style on one screen with everyone in the room — no accounts, no backend, no build step.

## How to play

2+ teams (works great with 3 or more) race to collect all **8 genre cards**
(Action, Comedy, Horror, Romance, Sci-Fi, Animation, Drama, Thriller). Each round, pick a mode:

- **🎬📺 Movies or TV Shows** — Category Battle and Quote It / One Word both run
  on either content pool. Toggle it on the board before picking a round.
- **Category Battle** — Chess-clock style: every team gets its own countdown
  time bank, and only the active team's clock runs. Call out a title that fits
  the category out loud (no typing) — the table judges it live. Got one? Tap
  "pass it on" to hand the running clock to the next team. Run your own clock
  to zero (or concede) and you're out. Last team standing wins a genre card.
- **🤫 Quote It / One Word** — One team picks a Clue Giver, who gets the round
  timer to get their team guessing 3 hidden titles using a quote (where there
  is one), a single word, or acting it out (no title, no spelling).
  Every correct guess wins a genre card.
- **🏆 Which Came First?** — No timer. Two titles (movies and TV mixed) appear
  side by side; tap the one you think released earlier. Get it right and win
  a genre card.

First team to collect all 8 genre cards wins.

## Features

- **In-browser rules reference** — the ❓ button opens a full How to Play modal any time.
- **~1,300 movies & TV shows** sourced from IMDb's free public datasets (see
  [Content data](#content-data--regenerating-it) below), spanning the last 40
  years and balanced across all 8 genres, plus a hand-curated set of quotes.
- **Adjustable timers** — pick the Category Battle time bank (8/12/16s) and
  the clue round length (20/30/45s) before you start.
- **Custom team colors** — click a team's swatch on setup to cycle its color.
- **2–6 teams** — add or remove teams freely; turn order rotates fairly.
- **Round history** — a running log of who won what and which genre they earned.
- **Save & resume** — progress is saved to your browser automatically; refreshing
  mid-game offers to resume where you left off (never mid-timer, so nothing feels stuck).
- **Sound & confetti** — light beeps for turn timers/correct guesses/round wins
  (mute with the 🔊 button) and a confetti celebration on the win screen.

## Run it locally

Just open [`index.html`](index.html) in a browser — it's a static site.

## Run with Docker / Portainer

### Option A — Portainer Stack (recommended)

1. In Portainer, go to **Stacks → Add stack**.
2. Choose **Repository**, point it at this GitHub repo, and set the compose
   path to `docker-compose.yml`. (Or paste the contents of
   [`docker-compose.yml`](docker-compose.yml) directly into the **Web editor**.)
3. Deploy the stack. The game will be available at `http://<your-host>:8089`.

### Option B — plain Docker

```bash
git clone <this-repo-url>
cd blockbuster-game
docker compose up -d --build
```

Then visit `http://localhost:8089`.

### Option C — build/run manually

```bash
docker build -t blockbuster-game .
docker run -d --name blockbuster-game -p 8089:80 --restart unless-stopped blockbuster-game
```

## Project structure

```
index.html         – page shell
style.css          – Blockbuster-blue-and-yellow styling
data.js            – hand-written categories + quote pools (movies & TV)
data-generated.js  – auto-generated large movie/TV pool (see below)
app.js             – game engine / UI (vanilla JS, no dependencies)
scripts/build-data.js – regenerates data-generated.js from IMDb's datasets
Dockerfile         – nginx:alpine static file server
docker-compose.yml – Portainer/Compose stack definition
```

## Content data & regenerating it

`data-generated.js` is *generated*, not hand-written. It's built from
[IMDb's free non-commercial datasets](https://datasets.imdbws.com/) — no API
key, no rate limits, updated by IMDb daily. `scripts/build-data.js`:

1. Downloads & streams `title.basics.tsv.gz` and `title.ratings.tsv.gz`
   (~230MB combined — it never loads the whole thing into memory at once).
2. Keeps movies and TV series from the last 40 years with enough votes to be
   widely recognizable (20k+ votes for movies, 4k+ for TV).
3. Maps IMDb's genre tags down to this game's 8 genres, and caps each genre
   bucket so no single genre (looking at you, Drama) crowds out the rest.
4. Writes the result to `data-generated.js`.

To refresh it with newer data:

```bash
node scripts/build-data.js
```

Needs only Node.js (no npm install — it's dependency-free, built-in `https`/
`zlib`/`readline` only) and takes a couple of minutes depending on your
connection. The IMDb datasets are licensed for personal/non-commercial use,
which fits this fan-made game; see IMDb's
[non-commercial licensing terms](https://developer.imdb.com/non-commercial-datasets/)
if you plan to use the data elsewhere.

Quotes (`MOVIES` and `TV_QUOTES` in `data.js`) and the Category Battle prompt
lists (`CATEGORIES`, `TV_CATEGORIES`) are hand-written — IMDb's bulk data
doesn't include quotes or thematic tags like "movies with a dog in them", so
those stay creative/manual work.

## Notes

This is a fan-made, non-commercial browser adaptation for personal/private use
with friends — not affiliated with or endorsed by the makers of the original
Blockbuster party game or the Blockbuster video rental brand.
