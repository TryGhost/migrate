#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
OUTPUT_PATH="${1:-${SCRIPT_DIR}/generated-posts.db}"
ROW_COUNT="${2:-50000}"

if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "sqlite3 CLI is required but was not found in PATH." >&2
    exit 1
fi

if ! [[ "${ROW_COUNT}" =~ ^[0-9]+$ ]] || [[ "${ROW_COUNT}" -lt 1 ]]; then
    echo "ROW_COUNT must be a positive integer. Received: ${ROW_COUNT}" >&2
    exit 1
fi

mkdir -p "$(dirname "${OUTPUT_PATH}")"
rm -f "${OUTPUT_PATH}"

SQL=$(cat <<EOF
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -200000;

DROP TABLE IF EXISTS posts;
CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL
);

WITH RECURSIVE
    rows(id, word_count) AS (
        SELECT 1, 10 + (abs(random()) % 11)
        UNION ALL
        SELECT id + 1, 10 + (abs(random()) % 11)
        FROM rows
        WHERE id < ${ROW_COUNT}
    ),
    seq(i) AS (
        SELECT 1
        UNION ALL
        SELECT i + 1
        FROM seq
        WHERE i < 20
    ),
    words(idx, word) AS (
        VALUES
            (1, 'lorem'),
            (2, 'ipsum'),
            (3, 'dolor'),
            (4, 'sit'),
            (5, 'amet'),
            (6, 'consectetur'),
            (7, 'adipiscing'),
            (8, 'elit'),
            (9, 'etiam'),
            (10, 'non'),
            (11, 'metus'),
            (12, 'elit'),
            (13, 'etiam'),
            (14, 'eros'),
            (15, 'leo'),
            (16, 'molestie'),
            (17, 'eget'),
            (18, 'malesuada'),
            (19, 'eget'),
            (20, 'euismod'),
            (21, 'vel'),
            (22, 'mauris'),
            (23, 'ut'),
            (24, 'luctus'),
            (25, 'purus'),
            (26, 'est,'),
            (27, 'sed'),
            (28, 'scelerisque'),
            (29, 'augue'),
            (30, 'tempus'),
            (31, 'id')
    )
INSERT INTO posts (id, title, body)
SELECT
    r.id,
    'Title ' || r.id,
    (
        SELECT group_concat(chosen.word, ' ')
        FROM (
            SELECT w.word
            FROM seq s
            JOIN words w ON w.idx = ((r.id * 13 + s.i - 1) % 31) + 1
            WHERE s.i <= r.word_count
            ORDER BY s.i
        ) AS chosen
    ) AS body
FROM rows r;
EOF
)

sqlite3 "${OUTPUT_PATH}" "${SQL}" >/dev/null

echo "Created ${OUTPUT_PATH} with ${ROW_COUNT} rows."
