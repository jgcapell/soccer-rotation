-- Soccer Rotation D1 schema
CREATE TABLE IF NOT EXISTS state (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  version    INTEGER NOT NULL,
  data       TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

-- Every saved version (last 500) for recovery
CREATE TABLE IF NOT EXISTS history (
  version    INTEGER PRIMARY KEY,
  data       TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);
