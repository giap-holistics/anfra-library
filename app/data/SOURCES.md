# Data sources

`books.csv` is built by `data/fetch-real.mjs` from real public book metadata; `sales.csv` is synthetic.
`generate-fake.mjs` (+ `catalogue.js`) rebuilds the old fully fake catalogue.

## Amazon Reviews 2023: Books item metadata

- What: `meta_Books.jsonl.gz` (4.4M Amazon book listings, crawled 2023): title, author, Amazon browse
  categories, offer price (USD), average star rating, ratings count, format, ISBN-13, publisher, reading age.
- URL: https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/meta_categories/meta_Books.jsonl.gz
  (project page https://amazon-reviews-2023.github.io/), no login.
- Publisher: McAuley Lab, UC San Diego. Cite: Hou et al., "Bridging Language and Items for Retrieval and
  Recommendation", arXiv:2403.03952 (2024).
- Licence: none stated; published openly for research. We use only item metadata (no reviews, no reviewer
  data, no customer data). Titles, authors, prices and ratings are bibliographic facts.
  If a strictly open licence is required, the fallback is Open Library (CC0) for titles/authors/ISBNs/ratings
  with prices resampled, at the cost of every price being synthetic.

## What is real and what is derived (per title: `books-provenance.csv`)

| column | origin |
|---|---|
| title, author | real (trailing series parenthetical trimmed; author from the "(Author)" credit) |
| isbn | real ISBN-13 (`isbn_source=source`), else synthetic `9789999xxxxxx` (Kindle-only listings) |
| price | real offer price (`price_source=source`); missing or outlier prices are drawn from the genre's real prices |
| rating | real average rating, one decimal |
| format | real binding when listed, else sampled (`format_source`) |
| category, genre | rule-mapped from Amazon browse category + title/description keywords into the app's 6 × 8 taxonomy, 40 most-rated titles per genre, one edition per work |
| market, audience_age | rules: publisher (self-published), binding, genre, Amazon "Reading age", publication year |
| hue | hash of the title |
| sales.csv | synthetic: 24 Monday weeks 2026-05-04 → 2026-10-12, volume ∝ ratings_count^0.7, mild per-genre trend, revenue = units × price |
