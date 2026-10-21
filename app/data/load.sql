-- Re-run: node data/fetch-real.mjs (or generate-fake.mjs) && duckdb data/library.new.duckdb < data/load.sql && mv data/library.new.duckdb data/library.duckdb
CREATE OR REPLACE TABLE books AS SELECT * FROM read_csv('data/books.csv', header = true, columns = {
  isbn: 'VARCHAR', title: 'VARCHAR', author: 'VARCHAR', category: 'VARCHAR', genre: 'VARCHAR', market: 'VARCHAR',
  audience_age: 'VARCHAR', format: 'VARCHAR', price: 'DECIMAL(10,2)', rating: 'DECIMAL(3,1)', hue: 'INTEGER' });
CREATE OR REPLACE TABLE sales AS SELECT * FROM read_csv('data/sales.csv', header = true, columns = {
  isbn: 'VARCHAR', week_start: 'DATE', units: 'INTEGER', revenue: 'DECIMAL(12,2)' });
SELECT 'books' AS t, count(*) FROM books UNION ALL SELECT 'sales', count(*) FROM sales;
SELECT min(week_start), max(week_start), sum(units), sum(revenue) FROM sales WHERE week_start >= DATE '2026-07-27';
