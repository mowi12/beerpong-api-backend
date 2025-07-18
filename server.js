// server.js

// 1. IMPORT DEPENDENCIES
const fastify = require("fastify")({ logger: true });
const path = require("path");
const Database = require("better-sqlite3");
const cors = require("@fastify/cors");

// 2. CONFIGURE SERVER AND DATABASE
const PORT = 3000;
const db = new Database(path.join(__dirname, "beerpong.db"));
// Enable WAL mode for better concurrency and performance.
db.pragma("journal_mode = WAL");

// Register CORS - IMPORTANT: Change origin for production
fastify.register(cors, {
  origin: "*", // In production, change to: 'https://your-username.github.io'
  methods: ["GET", "POST", "PUT", "DELETE"],
});

// 3. HELPER FUNCTION (to avoid repeating code)
// This function handles the complex logic of adding/updating player entries for a tournament.
// It will be used by both the CREATE and UPDATE routes.
function manageTournamentEntries(db, tournamentId, participants, placements) {
  const getPlayerStmt = db.prepare("SELECT id FROM players WHERE name = ?");
  const insertPlayerStmt = db.prepare("INSERT INTO players (name) VALUES (?)");
  const insertEntryStmt = db.prepare(
    "INSERT INTO tournament_entries (tournament_id, player_id, placement) VALUES (?, ?, ?)"
  );
  const playerIds = new Map();

  // Step 1: Ensure all players exist in the `players` table and get their IDs.
  for (const name of participants) {
    let player = getPlayerStmt.get(name);
    if (!player) {
      const info = insertPlayerStmt.run(name);
      player = { id: info.lastInsertRowid };
    }
    playerIds.set(name, player.id);
  }

  // Step 2: Insert each participant into the `tournament_entries` table with the correct placement.
  for (const name of participants) {
    const playerId = playerIds.get(name);
    let placement = null; // Default to no placement

    if (placements.firstPlace?.includes(name)) placement = 1;
    else if (placements.secondPlace?.includes(name)) placement = 2;
    else if (placements.thirdPlace?.includes(name)) placement = 3;

    insertEntryStmt.run(tournamentId, playerId, placement);
  }
}

// 4. DEFINE API ROUTES (CRUD)

// --- READ (All Players) ---
fastify.get("/api/players", async (request, reply) => {
  try {
    const stmt = db.prepare("SELECT * FROM players ORDER BY name");
    const players = stmt.all();
    return players;
  } catch (err) {
    fastify.log.error(err);
    reply.code(500).send({ error: "Failed to fetch players" });
  }
});

// --- READ (All Tournaments - List View) ---
fastify.get("/api/tournaments", async (request, reply) => {
  const sql = `
    SELECT
      t.id,
      t.date,
      t.type,
      t.flavor,
      (SELECT GROUP_CONCAT(p.name) FROM tournament_entries te JOIN players p ON te.player_id = p.id WHERE te.tournament_id = t.id) as participants
    FROM tournaments t
    ORDER BY t.date DESC;
  `;
  try {
    const stmt = db.prepare(sql);
    const tournaments = stmt.all();
    return tournaments;
  } catch (err) {
    fastify.log.error(err);
    reply.code(500).send({ error: "Failed to fetch tournaments" });
  }
});

// --- READ (Single Tournament - Detail View) ---
fastify.get("/api/tournaments/:id", async (request, reply) => {
  const { id } = request.params;
  try {
    const tournamentStmt = db.prepare("SELECT * FROM tournaments WHERE id = ?");
    const tournament = tournamentStmt.get(id);

    if (!tournament) {
      return reply.code(404).send({ error: "Tournament not found" });
    }

    const entriesStmt = db.prepare(`
            SELECT p.name, te.placement
            FROM tournament_entries te
            JOIN players p ON te.player_id = p.id
            WHERE te.tournament_id = ?
        `);
    const entries = entriesStmt.all(id);

    const response = {
      ...tournament,
      participants: entries.map((e) => e.name),
      placements: {
        firstPlace: entries.filter((e) => e.placement === 1).map((e) => e.name),
        secondPlace: entries
          .filter((e) => e.placement === 2)
          .map((e) => e.name),
        thirdPlace: entries.filter((e) => e.placement === 3).map((e) => e.name),
      },
    };

    return response;
  } catch (err) {
    fastify.log.error(err);
    reply.code(500).send({ error: "Failed to fetch tournament details" });
  }
});

// --- CREATE (New Tournament) ---
fastify.post("/api/tournaments", async (request, reply) => {
  const { date, type, flavor, participants, placements } = request.body;

  if (!date || !type || !participants || !placements) {
    return reply.code(400).send({ error: "Missing required fields" });
  }

  // Use a transaction to ensure all or nothing is written to the database
  const createTournament = db.transaction((data) => {
    // Step 1: Insert the new tournament record
    const tournamentStmt = db.prepare(
      "INSERT INTO tournaments (date, type, flavor) VALUES (?, ?, ?)"
    );
    const info = tournamentStmt.run(data.date, data.type, data.flavor);
    const tournamentId = info.lastInsertRowid;

    // Step 2: Use our helper function to manage the entries
    manageTournamentEntries(
      db,
      tournamentId,
      data.participants,
      data.placements
    );

    return { tournamentId };
  });

  try {
    const result = createTournament({
      date,
      type,
      flavor,
      participants,
      placements,
    });
    reply.code(201).send({
      message: "Tournament created successfully!",
      tournamentId: result.tournamentId,
    });
  } catch (err) {
    fastify.log.error(err);
    reply
      .code(500)
      .send({ error: "Failed to create tournament", details: err.message });
  }
});

// --- UPDATE (Existing Tournament) ---
fastify.put("/api/tournaments/:id", async (request, reply) => {
  const { id } = request.params;
  const { date, type, flavor, participants, placements } = request.body;

  if (!date || !type || !participants || !placements) {
    return reply.code(400).send({ error: "Missing required fields" });
  }

  const updateTournament = db.transaction((data) => {
    // Step 1: Update the main tournament details
    const updateStmt = db.prepare(
      "UPDATE tournaments SET date = ?, type = ?, flavor = ? WHERE id = ?"
    );
    const info = updateStmt.run(data.date, data.type, data.flavor, id);

    // If no rows were changed, the tournament ID doesn't exist
    if (info.changes === 0) {
      throw new Error("TournamentNotFound");
    }

    // Step 2: Delete all old entries for this tournament to start fresh
    const deleteEntriesStmt = db.prepare(
      "DELETE FROM tournament_entries WHERE tournament_id = ?"
    );
    deleteEntriesStmt.run(id);

    // Step 3: Use our helper function to re-create the entries with the new data
    manageTournamentEntries(db, id, data.participants, data.placements);

    return { tournamentId: id };
  });

  try {
    const result = updateTournament({
      date,
      type,
      flavor,
      participants,
      placements,
    });
    reply.code(200).send({
      message: "Tournament updated successfully!",
      tournamentId: result.tournamentId,
    });
  } catch (err) {
    fastify.log.error(err);
    if (err.message === "TournamentNotFound") {
      return reply.code(404).send({ error: "Tournament not found" });
    }
    reply
      .code(500)
      .send({ error: "Failed to update tournament", details: err.message });
  }
});

// --- DELETE (A Tournament) ---
fastify.delete("/api/tournaments/:id", async (request, reply) => {
  const { id } = request.params;

  try {
    // Because of "ON DELETE CASCADE" in our schema, deleting a tournament
    // will automatically delete all its corresponding `tournament_entries`.
    const stmt = db.prepare("DELETE FROM tournaments WHERE id = ?");
    const info = stmt.run(id);

    if (info.changes === 0) {
      return reply.code(404).send({ error: "Tournament not found" });
    }

    reply.code(200).send({ message: "Tournament deleted successfully" });
  } catch (err) {
    fastify.log.error(err);
    reply.code(500).send({ error: "Failed to delete tournament" });
  }
});

// 5. START THE SERVER
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    fastify.log.info(`Server listening on http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
