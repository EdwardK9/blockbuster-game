# Blockbuster: The Movie Game

A free browser tribute to the [Blockbuster party game](https://en.wikipedia.org/wiki/Blockbuster_(party_game)).
Play it hotseat-style on one screen with everyone in the room — no accounts, no backend, no build step.

## How to play

2+ teams (works great with 3 or more) race to collect all **8 genre cards**
(Action, Comedy, Horror, Romance, Sci-Fi, Animation, Drama, Thriller). Each round, pick one of two mini-games:

- **🎬 Category Battle** — Teams take turns naming a movie that fits a category
  (e.g. "Movies set in space") before a 12-second timer runs out. Repeat an
  answer, stall out, or get called out as invalid by the table and you're out.
  Last team standing wins the round and a genre card.
- **🤫 Quote It / One Word** — One team picks a Clue Giver, who has 30 seconds
  to get their team guessing 3 hidden movies using a famous quote, a single
  word, or acting it out (no title, no spelling). Every correct guess wins a
  genre card.

First team to collect all 8 genre cards wins.

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
index.html    – page shell
style.css     – Blockbuster-blue-and-yellow styling
data.js       – categories, movies, quotes, genres
app.js        – game engine / UI (vanilla JS, no dependencies)
Dockerfile    – nginx:alpine static file server
docker-compose.yml – Portainer/Compose stack definition
```

## Notes

This is a fan-made, non-commercial browser adaptation for personal/private use
with friends — not affiliated with or endorsed by the makers of the original
Blockbuster party game or the Blockbuster video rental brand.
