const fs = require("fs");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { loadFunctions } = require("./helpers/source-loader");
const { assert, runTest } = require("./helpers/test-harness");

function runSql(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) {
                reject(err);
                return;
            }

            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getSql(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(row);
        });
    });
}

module.exports = async function runServerIntegrationTests() {
    let failed = 0;

    failed += Number(!(await runTest("server integration tests: pruneExpiredHabits removes habits older than 30 days and cascades logs", async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "habittrack-db-test-"));
        const databasePath = path.join(tempDir, "habits.db");
        const db = new sqlite3.Database(databasePath);

        try {
            await runSql(db, "PRAGMA foreign_keys = ON");
            await runSql(db, `
                CREATE TABLE habits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    name TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await runSql(db, `
                CREATE TABLE habit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    habit_id INTEGER NOT NULL,
                    completion_date DATE NOT NULL,
                    entry_type TEXT NOT NULL DEFAULT 'full',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
                )
            `);

            await runSql(db, "INSERT INTO habits (id, user_id, name, created_at) VALUES (1, 1, 'Expired habit', '2026-03-01 09:00:00')");
            await runSql(db, "INSERT INTO habits (id, user_id, name, created_at) VALUES (2, 1, 'Fresh habit', '2026-04-20 09:00:00')");
            await runSql(db, "INSERT INTO habit_logs (habit_id, completion_date, entry_type, created_at) VALUES (1, '2026-03-10', 'full', '2026-03-10 09:30:00')");
            await runSql(db, "INSERT INTO habit_logs (habit_id, completion_date, entry_type, created_at) VALUES (2, '2026-04-21', 'full', '2026-04-21 09:30:00')");

            const serverFunctions = loadFunctions(
                "src/server.js",
                ["formatSqliteDateTime", "getHabitAutoDeleteCutoff", "pruneExpiredHabits"],
                {
                    context: {
                        HABIT_AUTO_DELETE_DAYS: 30,
                        dbRun: (sql, params = []) => runSql(db, sql, params)
                    }
                }
            );

            const deletedCount = await serverFunctions.pruneExpiredHabits(new Date("2026-04-25T12:00:00Z"));
            const expiredHabit = await getSql(db, "SELECT id FROM habits WHERE id = 1");
            const freshHabit = await getSql(db, "SELECT id FROM habits WHERE id = 2");
            const expiredLogs = await getSql(db, "SELECT COUNT(*) AS count FROM habit_logs WHERE habit_id = 1");
            const freshLogs = await getSql(db, "SELECT COUNT(*) AS count FROM habit_logs WHERE habit_id = 2");

            assert.equal(deletedCount, 1);
            assert.equal(expiredHabit, undefined);
            assert.deepEqual(freshHabit, { id: 2 });
            assert.equal(expiredLogs.count, 0);
            assert.equal(freshLogs.count, 1);
        } finally {
            await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    })));

    return failed;
};
