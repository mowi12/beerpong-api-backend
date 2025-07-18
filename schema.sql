PRAGMA foreign_keys=OFF;

CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('single', 'team')),
    flavor TEXT
);

CREATE TABLE tournament_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    placement INTEGER,
    FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
    UNIQUE(tournament_id, player_id)
);

PRAGMA foreign_keys=ON;