#!/usr/bin/env node
// Builds data-generated.js from IMDb's free non-commercial datasets
// (https://datasets.imdbws.com/ — see IMDb's non-commercial licence).
// Streams and filters ~250MB of source data down to a small curated
// JS file of well-known movies and TV series from the last N years,
// bucketed into this game's 8 genres. No API key needed.
//
// Usage: node scripts/build-data.js
//
// Re-run any time to refresh the pool with newer/updated IMDb data.

const https = require("https");
const zlib = require("zlib");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const YEARS_BACK = 40;
const MIN_YEAR = new Date().getFullYear() - YEARS_BACK;
const MOVIE_MIN_VOTES = 20000;
const TV_MIN_VOTES = 4000;
const PER_GENRE_CAP_MOVIES = 90;
const PER_GENRE_CAP_TV = 55;

// Our 8 genre cards. IMDb tags titles with multiple genres from a much
// larger vocabulary; we map down to these 8, preferring the more
// distinctive genre first so Drama/Comedy don't swallow everything.
const GENRE_PRIORITY = [
  "Horror", "Sci-Fi", "Animation", "Romance", "Thriller", "Action", "Comedy", "Drama"
];
const IMDB_GENRE_MAP = {
  Horror: "Horror",
  "Sci-Fi": "Sci-Fi",
  Animation: "Animation",
  Romance: "Romance",
  Thriller: "Thriller",
  Action: "Action",
  Comedy: "Comedy",
  Drama: "Drama",
};

function mapGenre(imdbGenresCsv) {
  const tags = imdbGenresCsv.split(",");
  for (const g of GENRE_PRIORITY) {
    if (tags.includes(g)) return IMDB_GENRE_MAP[g];
  }
  return null;
}

function fetchGunzippedLines(url, onLine) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} -> ${res.statusCode}`));
        return;
      }
      const gunzip = zlib.createGunzip();
      res.pipe(gunzip);
      const rl = readline.createInterface({ input: gunzip, crlfDelay: Infinity });
      let first = true;
      rl.on("line", line => {
        if (first) { first = false; return; } // skip header
        onLine(line);
      });
      rl.on("close", resolve);
      rl.on("error", reject);
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  console.log(`Filtering to titles from ${MIN_YEAR}-present with enough votes to be recognizable...`);

  // ---- Pass 1: ratings (tconst -> {rating, votes}) ----
  console.log("Downloading & parsing title.ratings.tsv.gz ...");
  const ratings = new Map();
  await fetchGunzippedLines("https://datasets.imdbws.com/title.ratings.tsv.gz", line => {
    const [tconst, averageRating, numVotes] = line.split("\t");
    ratings.set(tconst, { rating: parseFloat(averageRating), votes: parseInt(numVotes, 10) });
  });
  console.log(`  ratings loaded: ${ratings.size.toLocaleString()}`);

  // ---- Pass 2: basics, filtered & joined with ratings ----
  console.log("Downloading & parsing title.basics.tsv.gz (this is the big one, ~225MB compressed)...");
  const movieCandidates = [];
  const tvCandidates = [];
  let seen = 0;
  await fetchGunzippedLines("https://datasets.imdbws.com/title.basics.tsv.gz", line => {
    seen++;
    const cols = line.split("\t");
    const [tconst, titleType, primaryTitle, , isAdult, startYearStr, , , genresCsv] = cols;
    if (isAdult === "1") return;
    if (titleType !== "movie" && titleType !== "tvSeries") return;
    const startYear = parseInt(startYearStr, 10);
    if (!startYear || startYear < MIN_YEAR) return;
    if (!genresCsv || genresCsv === "\\N") return;
    const genre = mapGenre(genresCsv);
    if (!genre) return;
    const r = ratings.get(tconst);
    if (!r) return;
    const minVotes = titleType === "movie" ? MOVIE_MIN_VOTES : TV_MIN_VOTES;
    if (r.votes < minVotes) return;
    const entry = { title: primaryTitle, year: startYear, genre, votes: r.votes };
    if (titleType === "movie") movieCandidates.push(entry);
    else tvCandidates.push(entry);
  });
  console.log(`  scanned ${seen.toLocaleString()} titles total`);
  console.log(`  candidates: ${movieCandidates.length.toLocaleString()} movies, ${tvCandidates.length.toLocaleString()} tv series`);

  function bucketAndCap(list, capPerGenre) {
    const byGenre = {};
    list.forEach(e => {
      (byGenre[e.genre] = byGenre[e.genre] || []).push(e);
    });
    const out = [];
    Object.keys(byGenre).forEach(g => {
      byGenre[g].sort((a, b) => b.votes - a.votes);
      out.push(...byGenre[g].slice(0, capPerGenre));
    });
    return out
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(e => ({ title: e.title, year: e.year, genre: e.genre }));
  }

  const movies = bucketAndCap(movieCandidates, PER_GENRE_CAP_MOVIES);
  const tv = bucketAndCap(tvCandidates, PER_GENRE_CAP_TV);

  console.log(`Selected: ${movies.length} movies, ${tv.length} TV series`);

  const genreCounts = list => {
    const c = {};
    list.forEach(e => { c[e.genre] = (c[e.genre] || 0) + 1; });
    return c;
  };
  console.log("Movie genre distribution:", genreCounts(movies));
  console.log("TV genre distribution:", genreCounts(tv));

  const header =
    `// AUTO-GENERATED by scripts/build-data.js from IMDb's free non-commercial datasets\n` +
    `// (https://datasets.imdbws.com/, see IMDb's non-commercial licence). Do not hand-edit —\n` +
    `// re-run "node scripts/build-data.js" to refresh. Generated ${new Date().toISOString().slice(0, 10)}.\n` +
    `// Titles from ${MIN_YEAR}-present with enough IMDb votes to be widely recognizable.\n` +
    `// No quotes here (bulk dataset doesn't have them) — these power the no-quote\n` +
    `// "one word / act it out" clue mode and the category-battle content pools.\n\n`;

  const body =
    `const MOVIES_LARGE = ${JSON.stringify(movies, null, 2)};\n\n` +
    `const TV_SHOWS = ${JSON.stringify(tv, null, 2)};\n`;

  const outPath = path.join(__dirname, "..", "data-generated.js");
  fs.writeFileSync(outPath, header + body);
  console.log(`Wrote ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
