const path = require("path");
const fs = require("fs");
const { app, dialog } = require("electron");
const Database = require("better-sqlite3");
const dayjs = require("dayjs");
const crypto = require("crypto");
const log = require("electron-log");

// Tables that participate in multi-PC sync. tests_catalog is excluded —
// it is server-seeded and never edited per-lab.
const SYNCED_TABLES = [
  "patients",
  "doctors",
  "tests",
  "packages",
  "test_to_packages",
  // visit_v2/visit_item_v2 are the tables actually written by the current
  // UI (registerVisitV2 etc.). The old "visits" table's sync support was
  // removed while still in dev — no installs had synced through it yet.
  "visit_v2",
  "visit_item_v2",
];

// main.js constructs a fresh LabDB per IPC message, so the sync flag must
// live at module level to survive across instances.
let globalSyncEnabled = false;
function setGlobalSyncEnabled(enabled) {
  globalSyncEnabled = !!enabled;
}

class LabDB {
  constructor() {
    this.db = null;
    this.dbPath = path.join(app.getPath("userData"), "drlab.db");
    // `await new LabDB()` does NOT wait for this — it resolves as soon as
    // the constructor returns, regardless of whether init() has finished.
    // Callers must `await labDB.ready` before touching this.db, otherwise
    // this.db can still be null (race depends on handlePendingImport's
    // timing, which is why this only failed intermittently before).
    this.ready = this.init();
  }

  // Armed by the renderer (usePlan) via IPC once the server confirms the
  // account has multi-PC sync. Off = every code path behaves exactly as
  // before sync existed (hard deletes, no push).
  get syncEnabled() {
    return globalSyncEnabled;
  }

  // Nudge the sync engine to push soon instead of waiting for its next
  // scheduled cycle (up to 60s). Lazy require avoids a circular dependency
  // with sync.js (which requires this file) — by the time any write happens
  // both modules are already fully loaded, so this just hits the cache.
  kickSync() {
    try {
      require("./sync").syncEngine.kick();
    } catch (error) {
      console.error("Error kicking sync engine:", error);
    }
  }

  // Stamp a row for sync after any local write. uuid is assigned lazily so
  // legacy writes stay untouched until first marked.
  markDirty(table, id) {
    try {
      this.db
        .prepare(
          `UPDATE ${table} SET uuid = COALESCE(uuid, ?), dirty = 1 WHERE id = ?`
        )
        .run(crypto.randomUUID(), id);
      this.kickSync();
    } catch (error) {
      console.error(`Error marking ${table}#${id} dirty:`, error);
    }
  }

  softDelete(table, id, column = "id") {
    // Row-by-row so each row gets its own uuid if it never had one.
    const rows = this.db
      .prepare(`SELECT id FROM ${table} WHERE ${column} = ? AND deletedAt IS NULL`)
      .all(id);
    const stmt = this.db.prepare(
      `UPDATE ${table}
       SET deletedAt = datetime('now'), dirty = 1,
           uuid = COALESCE(uuid, ?), updatedAt = datetime('now')
       WHERE id = ?`
    );
    for (const row of rows) {
      stmt.run(crypto.randomUUID(), row.id);
    }
    if (rows.length > 0) this.kickSync();
    return rows.length;
  }

  async init() {
    try {
      await this.handlePendingWipe();
      await this.handlePendingImport();
      this.db = new Database(this.dbPath, {
        // verbose: console.log,
      });
      this.db.pragma("journal_mode = WAL");
      console.log("Database opened successfully");
      this.initializeDatabase();
      this.seedTestsCatalogIfEmpty();
      this.alterDoctorTableIfNeeded();
      this.checkAndAddTestTypeColumnAndGroupTest();
      this.checkAndAddVisitNumberColumn();
      this.initTestsFromJSON();
      this.migrateVisitsTableWithDoctorForeignKey();
      await this.checkAndAddSyncColumns();
      this.checkAndAddReportTemplatesTable();
      console.log(
        "LabDB initialized, db object:",
        this.db ? "exists" : "does not exist"
      );
      if (this.db) {
        console.log("Available collections:", Object.keys(this.db));
      }
    } catch (err) {
      // Plain console.error never reaches the persisted log file in a
      // packaged build (only electron-log calls do), so a native-module or
      // file-access failure here was previously invisible after the fact.
      log.error("[LabDB] Error opening database:", err && err.message);
      console.error("Error opening database", err);
    }
  }

  initializeDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patients(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        gender TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        birth DATE NOT NULL,
        uuid TEXT,
        dirty INTEGER DEFAULT 0,
        syncedAt TEXT,
        deletedAt TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS doctors(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        gender TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        type TEXT,
        uuid TEXT,
        dirty INTEGER DEFAULT 0,
        syncedAt TEXT,
        deletedAt TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patientID INTEGER,
        doctorID INTEGER,
        visitNumber VARCHAR(6),
        status TEXT DEFAULT "PENDING" NOT NULL,
        testType VARCHAR(50),
        tests TEXT,
        discount INTEGER,
        uuid TEXT,
        dirty INTEGER DEFAULT 0,
        syncedAt TEXT,
        deletedAt TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(patientID) REFERENCES patients(id)
        FOREIGN KEY(doctorID) REFERENCES doctors(id)
      );

      CREATE TABLE IF NOT EXISTS tests(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(50),
      price INTEGER, 
      type TEXT,
      groupTest TEXT DEFAULT "[]",
      normal TEXT,
      options TEXT,
      isSelecte INTEGER DEFAULT 0,
      uuid TEXT,
      dirty INTEGER DEFAULT 0,
      syncedAt TEXT,
      deletedAt TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
     );
      CREATE TABLE IF NOT EXISTS packages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(100),
        customePrice INTEGER,
        uuid TEXT,
        dirty INTEGER DEFAULT 0,
        syncedAt TEXT,
        deletedAt TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

       CREATE TABLE IF NOT EXISTS test_to_packages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        packageID INTEGER,
        testID INTEGER,
        uuid TEXT,
        dirty INTEGER DEFAULT 0,
        syncedAt TEXT,
        deletedAt TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (packageID) REFERENCES packages(id) ON DELETE CASCADE,
        FOREIGN KEY (testID) REFERENCES tests(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tests_catalog (
        id          INTEGER PRIMARY KEY,
        code        TEXT    NOT NULL UNIQUE,                     
        type        TEXT    NOT NULL CHECK (type IN ('single','panel','composite')),
        name_en     TEXT    NOT NULL,                           
        name_ar     TEXT,                                     
        sample_type TEXT,                                         
        unit        TEXT,                                        
        ref_text    TEXT,                                        
        meta_json   TEXT    NOT NULL DEFAULT '{}',               
        price_iqd   INTEGER NOT NULL DEFAULT 0,                  
        is_active   INTEGER NOT NULL DEFAULT 1,                  
        version     TEXT,                                        
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      PRAGMA foreign_keys = ON;
      
      CREATE TABLE IF NOT EXISTS visit_v2 (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        visit_number     TEXT UNIQUE,                        
        patient_id       INTEGER NOT NULL,                  
        doctor_id        INTEGER,                           
        status           TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PARTIAL','COMPLETED','CANCELLED')),
        notes            TEXT,

        gross_price_iqd  INTEGER NOT NULL DEFAULT 0,          
        discount_iqd     INTEGER NOT NULL DEFAULT 0,         
        end_price_iqd    INTEGER NOT NULL DEFAULT 0,         

        paid_iqd         INTEGER NOT NULL DEFAULT 0,
        payment_status   TEXT NOT NULL DEFAULT 'UNPAID'
                        CHECK (payment_status IN ('UNPAID','PARTIAL','PAID')),

        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        FOREIGN KEY (doctor_id)  REFERENCES doctors(id)  ON DELETE SET NULL  ON UPDATE CASCADE
      );

      CREATE TABLE IF NOT EXISTS visit_item_v2 (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        visit_id         INTEGER NOT NULL,                   
        test_id          INTEGER NOT NULL,                   

    
        code             TEXT NOT NULL,                     
        type             TEXT NOT NULL CHECK (type IN ('single','panel','composite')),
        name_en          TEXT NOT NULL,
        name_ar          TEXT,
        sample_type      TEXT,
        unit             TEXT,                                
        ref_text         TEXT,                                
        price_iqd        INTEGER NOT NULL DEFAULT 0,
        is_active_catalog INTEGER NOT NULL DEFAULT 1,
        meta_json        TEXT NOT NULL DEFAULT '{}',         

        result_value     TEXT,                              
        result_numeric   REAL,                            
        result_unit      TEXT,                             
        result_json      TEXT,                               
        is_abnormal      INTEGER NOT NULL DEFAULT 0,

        item_status      TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (item_status IN ('PENDING','READY','VERIFIED','PRINTED')),
        technician_name  TEXT,
        method           TEXT,
        completed_at     TEXT,
        printed_at       TEXT,

        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

        FOREIGN KEY (visit_id) REFERENCES visit_v2(id)     ON DELETE CASCADE  ON UPDATE CASCADE,
        FOREIGN KEY (test_id)  REFERENCES tests_catalog(id) ON DELETE RESTRICT ON UPDATE CASCADE
      );


      CREATE TABLE IF NOT EXISTS visit_result_v2 (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        visit_item_id    INTEGER NOT NULL,                    

        path             TEXT,                              
        code             TEXT,                              
        label_en         TEXT,
        label_ar         TEXT,

        value_text       TEXT,
        value_num        REAL,
        unit             TEXT,
        ref_text         TEXT,                               
        flag             TEXT,                             
        note             TEXT,

        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

        FOREIGN KEY (visit_item_id) REFERENCES visit_item_v2(id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_state(
        tableName TEXT PRIMARY KEY,
        serverCursor TEXT
      );

    `);
  }

  async alterDoctorTableIfNeeded() {
    // check schema info
    const pragma = this.db.prepare(`PRAGMA table_info(doctors)`).all();

    const colNames = pragma.map((c) => c.name);

    const toAdd = [];
    if (!colNames.includes("doctor_fee")) {
      toAdd.push(`ADD COLUMN doctor_fee INTEGER DEFAULT 0`);
    }
    if (!colNames.includes("note")) {
      toAdd.push(`ADD COLUMN note TEXT`);
    }

    if (toAdd.length > 0) {
      toAdd.forEach((sql) =>
        this.db.prepare(`ALTER TABLE doctors ${sql}`).run()
      );
    }

    return { success: true, message: "Doctor table updated if needed" };
  }

  seedTestsCatalogIfEmpty() {
    const table = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tests_catalog'"
      )
      .get();
    if (!table) {
      console.log("ℹ️ tests_catalog table not found yet.");
      return;
    }
    const { count } = this.db
      .prepare("SELECT COUNT(*) AS count FROM tests_catalog")
      .get();
    if (count > 0) {
      console.log("ℹ️ tests_catalog already has data. Skipping seed.sql");
      return;
    }

    try {
      const seedPath = path.join(__dirname, "seed.sql");
      const sql = fs.readFileSync(seedPath, "utf8");
      this.db.exec(sql);
      console.log(`✅ Seed executed successfully from: ${seedPath}`);
    } catch (err) {
      console.error("❌ Failed to execute seed.sql:", err);
    }
  }

  async getTopTests() {
    try {
      // fixed, curated list (keeps working for new users)
      const ids = [
        53, // Lipid Profile
        52, // Renal Function Test
        67, // Stool Examination
        68, // Urine Examination
        69, // Culture Report
        55, // TORCH Panel
        51, // Liver Function Test
        70, // Semen Analysis
        59, // Vitamin Profile
        57, // Hormonal Panel
        50, // Complete Blood Count
        54, // Thyroid Function Test
      ];

      // Build an ordered inline table (id, ord)
      const values = ids.map((id, i) => `(${id},${i})`).join(",");
      const sql = `
      WITH wanted(id, ord) AS (VALUES ${values})
      SELECT
        t.id,
        t.name_en as title
      FROM tests_catalog t
      JOIN wanted w ON w.id = t.id
      ORDER BY w.ord
    `;

      const rows = this.db.prepare(sql).all();
      return { success: true, data: rows };
    } catch (err) {
      console.error("Error in getTopTraditionalTests:", err);
      return { success: false, error: err.message };
    }
  }

  // Report templates (Settings → Report Templates designer). Deliberately
  // not in SYNCED_TABLES: the sync server has no mirror table for them, and
  // designs can carry large embedded logos. The whole design lives in
  // config_json; the scalar columns only exist for listing/filtering.
  checkAndAddReportTemplatesTable() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS report_templates(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT,
          language TEXT,
          page_size TEXT,
          orientation TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          version INTEGER NOT NULL DEFAULT 1,
          config_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
    } catch (error) {
      log.error("[LabDB] Error creating report_templates table:", error && error.message);
    }
  }

  rowToReportTemplate(row) {
    if (!row) return null;
    let config = {};
    try {
      config = JSON.parse(row.config_json) || {};
    } catch (_) {}
    return {
      ...config,
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      description: row.description || "",
      category: row.category || "",
      language: row.language || config.language || "en",
      isDefault: !!row.is_default,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getReportTemplates() {
    const rows = this.db
      .prepare(`SELECT * FROM report_templates ORDER BY is_default DESC, updated_at DESC`)
      .all();
    return { success: true, data: rows.map((r) => this.rowToReportTemplate(r)) };
  }

  getReportTemplate(id) {
    const row = this.db.prepare(`SELECT * FROM report_templates WHERE id = ?`).get(id);
    if (!row) return { success: false, error: "Template not found" };
    return { success: true, data: this.rowToReportTemplate(row) };
  }

  getDefaultReportTemplate() {
    const row = this.db
      .prepare(`SELECT * FROM report_templates WHERE is_default = 1 ORDER BY updated_at DESC LIMIT 1`)
      .get();
    return row ? this.rowToReportTemplate(row) : null;
  }

  // Insert when `template.id` is empty, otherwise update (bumping version).
  // Making a template default clears the flag everywhere else in the same
  // transaction so there's never more than one.
  saveReportTemplate(template) {
    const now = new Date().toISOString();
    const {
      id,
      name,
      description = "",
      category = "",
      language = "en",
      isDefault = false,
      page = {},
    } = template || {};
    if (!String(name || "").trim()) return { success: false, error: "Template name is required" };

    const config = { ...template };
    delete config.id;
    const run = this.db.transaction(() => {
      if (isDefault) this.db.prepare(`UPDATE report_templates SET is_default = 0`).run();
      if (id) {
        const existing = this.db.prepare(`SELECT version FROM report_templates WHERE id = ?`).get(id);
        if (!existing) throw new Error("Template not found");
        const version = (existing.version || 1) + 1;
        config.version = version;
        config.updatedAt = now;
        this.db
          .prepare(
            `UPDATE report_templates SET name = ?, description = ?, category = ?, language = ?,
               page_size = ?, orientation = ?, is_default = ?, version = ?, config_json = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(
            name.trim(), description, category, language, page.size || "A4",
            page.orientation || "portrait", isDefault ? 1 : 0, version, JSON.stringify(config), now, id
          );
        return id;
      }
      config.version = 1;
      config.createdAt = now;
      config.updatedAt = now;
      const info = this.db
        .prepare(
          `INSERT INTO report_templates (uuid, name, description, category, language, page_size,
             orientation, is_default, version, config_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .run(
          template.uuid || crypto.randomUUID(), name.trim(), description, category, language,
          page.size || "A4", page.orientation || "portrait", isDefault ? 1 : 0,
          JSON.stringify(config), now, now
        );
      return info.lastInsertRowid;
    });
    const savedId = run();
    return this.getReportTemplate(Number(savedId));
  }

  deleteReportTemplate(id) {
    const info = this.db.prepare(`DELETE FROM report_templates WHERE id = ?`).run(id);
    return { success: info.changes > 0 };
  }

  // id = null clears the default, so visit reports go back to the classic layout.
  setDefaultReportTemplate(id) {
    this.db.transaction(() => {
      this.db.prepare(`UPDATE report_templates SET is_default = 0`).run();
      if (id) this.db.prepare(`UPDATE report_templates SET is_default = 1 WHERE id = ?`).run(id);
    })();
    return { success: true };
  }

  async checkAndAddVisitNumberColumn() {
    try {
      // Check if the visits table has the visitNumber column
      const columnCheckStmt = this.db.prepare(`
        PRAGMA table_info(visits)
      `);
      const columns = columnCheckStmt.all();

      const hasVisitNumberColumn = columns.some(
        (column) => column.name === "visitNumber"
      );

      if (!hasVisitNumberColumn) {
        // Alter the table to add the visitNumber column if it doesn't exist
        this.db.exec(`
          ALTER TABLE visits ADD COLUMN visitNumber VARCHAR(6)
        `);
        console.log("visitNumber column added successfully");
      } else {
        console.log("visitNumber column already exists");
      }
    } catch (error) {
      console.error("Error checking or adding visitNumber column:", error);
    }
  }

  async checkAndAddTestTypeColumnAndGroupTest() {
    try {
      // Check if the tests table has the type and groupTest columns
      const columnCheckStmt = this.db.prepare(`
        PRAGMA table_info(tests)
      `);
      const columns = columnCheckStmt.all();

      const hasTypeColumn = columns.some((column) => column.name === "type");

      const hasGroupTestColumn = columns.some(
        (column) => column.name === "groupTest"
      );

      if (!hasTypeColumn) {
        // Alter the table to add the type column if it doesn't exist
        this.db.exec(`
          ALTER TABLE tests ADD COLUMN type TEXT
        `);
        console.log("type column added successfully");
      } else {
        console.log("type column already exists");
      }

      if (!hasGroupTestColumn) {
        this.db.exec(`
          ALTER TABLE tests ADD COLUMN groupTest TEXT DEFAULT "[]"
        `);
        console.log("groupTest column added successfully");
      } else {
        console.log("groupTest column already exists");
      }
    } catch (error) {
      console.error("Error checking or adding type column:", error);
    }
  }

  async searchGroupTest() {
    try {
      const tests = this.db.prepare(
        `SELECT * FROM tests WHERE deletedAt IS NULL ORDER BY id DESC LIMIT 8`
      );

      return tests.all();
    } catch (error) {
      console.error("Error searching group test:", error);
      return [];
    }
  }

  async addNewData(data) {
    try {
      // Validate that data is an array
      if (!Array.isArray(data)) {
        console.error(
          "addNewData: data parameter is not an array:",
          typeof data,
          data
        );
        throw new Error("Data parameter must be an array");
      }

      if (data.length === 0) {
        console.log("addNewData: No data provided to import");
        return;
      }

      // Check which test groups already exist in the database
      const existingTestsStmt = this.db.prepare(`
        SELECT name FROM tests WHERE type = 'groupTest'
      `);
      const existingTests = existingTestsStmt.all();
      const existingTestNames = new Set(existingTests.map((test) => test.name));

      // Filter out test groups that already exist
      const newTestGroups = data.filter(
        (testGroup) => !existingTestNames.has(testGroup.name)
      );

      if (newTestGroups.length === 0) {
        console.log(
          "All test groups from newTestGroups.json already exist in database"
        );
        return;
      }

      // Insert new test groups into database
      const insertStmt = this.db.prepare(`
        INSERT INTO tests (name, price, normal, options, isSelecte, type, groupTest, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const insertTransaction = this.db.transaction((testGroups) => {
        for (const testGroup of testGroups) {
          const normalValue = testGroup.normal
            ? testGroup.normal.replace(/\\n/g, "\n")
            : "";

          insertStmt.run(
            testGroup.name,
            Number(testGroup.price || 0),
            normalValue,
            testGroup.options || "[]",
            Number(testGroup.isSelecte || 0),
            testGroup.type || "groupTest",
            testGroup.groupTest || "[]"
          );
        }
      });

      insertTransaction(newTestGroups);

      console.log(
        `Successfully imported ${newTestGroups.length} new test groups from newTestGroups.json:`,
        newTestGroups.map((tg) => tg.name)
      );
    } catch (error) {
      console.error("Error checking or importing new test groups:", error);
    }
  }

  async migrateVisitsTableWithDoctorForeignKey() {
    try {
      // Step 1: Enable foreign keys
      this.db.prepare(`PRAGMA foreign_keys = ON;`).run();

      // Step 2: Check if doctorID column already exists
      const columns = this.db.prepare(`PRAGMA table_info(visits);`).all();
      const hasDoctorID = columns.some((col) => col.name === "doctorID");

      if (hasDoctorID) {
        console.log("✅ doctorID column already exists, skipping migration.");
        return;
      }

      this.db.transaction(() => {
        // Step 3: Rename the existing table
        this.db.prepare(`ALTER TABLE visits RENAME TO visits_old;`).run();

        // Step 4: Create the new table with foreign key constraint
        this.db
          .prepare(
            `
            CREATE TABLE visits (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              patientID INTEGER,
              doctorID INTEGER,
              visitNumber VARCHAR(6),
              status TEXT DEFAULT "PENDING" NOT NULL,
              testType VARCHAR(50),
              tests TEXT,
              discount INTEGER,
              updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(patientID) REFERENCES patients(id),
              FOREIGN KEY(doctorID) REFERENCES doctors(id)
            );
        `
          )
          .run();

        // Step 5: Copy data from the old table
        const oldColumns = columns.map((col) => col.name).join(", ");
        const newColumns = oldColumns + ", NULL"; // doctorID is not in the old table

        this.db
          .prepare(
            `
          INSERT INTO visits (
            id, patientID, doctorID, visitNumber, status, testType, tests, discount, updatedAt, createdAt
          )
          SELECT
            id, patientID, NULL, visitNumber, status, testType, tests, discount, updatedAt, createdAt
          FROM visits_old;
        `
          )
          .run();

        // Step 6: Drop old table
        this.db.prepare(`DROP TABLE visits_old;`).run();

        console.log("✅ visits table migrated with doctorID foreign key.");
      })();
    } catch (err) {
      console.error("❌ Migration failed:", err.message);
    }
  }

  async checkAndAddSyncColumns() {
    try {
      // SQLite disallows non-constant defaults in ADD COLUMN, so columns are
      // added bare and backfilled explicitly below.
      const syncColumns = [
        ["uuid", "TEXT"],
        ["dirty", "INTEGER DEFAULT 0"],
        ["syncedAt", "TEXT"],
        ["deletedAt", "TEXT"],
      ];

      const patientColumns = this.db.prepare(`PRAGMA table_info(patients)`).all();
      const needsMigration = !patientColumns.some((c) => c.name === "uuid");

      if (needsMigration) {
        // One-time safety copy of the DB before touching existing installs.
        const backupPath = path.join(
          app.getPath("userData"),
          "drlab.pre-sync-backup.db"
        );
        if (!fs.existsSync(backupPath)) {
          await this.db.backup(backupPath);
          console.log("✅ Pre-sync backup created at", backupPath);
        }
      }

      for (const table of SYNCED_TABLES) {
        const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
        const columnNames = new Set(columns.map((c) => c.name));

        for (const [name, type] of syncColumns) {
          if (!columnNames.has(name)) {
            this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
          }
        }

        // test_to_packages has no timestamps; sync needs an LWW watermark.
        if (!columnNames.has("updatedAt")) {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN updatedAt DATETIME`);
          this.db.exec(
            `UPDATE ${table} SET updatedAt = datetime('now') WHERE updatedAt IS NULL`
          );
        }
        if (!columnNames.has("createdAt")) {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN createdAt DATETIME`);
          this.db.exec(
            `UPDATE ${table} SET createdAt = datetime('now') WHERE createdAt IS NULL`
          );
        }
      }

      // Backfill uuids row-by-row; existing rows are marked dirty so the
      // first sync cycle doubles as the initial full upload.
      const backfill = this.db.transaction(() => {
        for (const table of SYNCED_TABLES) {
          const rows = this.db
            .prepare(`SELECT id FROM ${table} WHERE uuid IS NULL`)
            .all();
          if (rows.length === 0) continue;
          const update = this.db.prepare(
            `UPDATE ${table} SET uuid = ?, dirty = 1 WHERE id = ?`
          );
          for (const row of rows) {
            update.run(crypto.randomUUID(), row.id);
          }
          console.log(`✅ Backfilled ${rows.length} uuids in ${table}`);
        }
      });
      backfill();

      for (const table of SYNCED_TABLES) {
        this.db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uuid ON ${table}(uuid)`
        );
      }

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state(
          tableName TEXT PRIMARY KEY,
          serverCursor TEXT
        );
      `);

      if (needsMigration) {
        console.log("✅ Sync columns migration completed");
      }
    } catch (error) {
      // Non-fatal by design: the app must keep working exactly as before
      // even if sync preparation fails. Sync simply stays disabled.
      console.error("Error adding sync columns (sync will stay disabled):", error);
    }
  }

  async initTestsFromJSON() {
    try {
      const testCountStet = this.db.prepare(`
        SELECT COUNT(*) as total FROM tests
      `);
      const { total } = testCountStet.get();

      if (total === 0) {
        const jsonPath = path.join(__dirname, "tests.json");
        const jsonGroupPath = path.join(__dirname, "groups.json");

        if (!fs.existsSync(jsonPath) || !fs.existsSync(jsonGroupPath)) {
          throw new Error("One or both JSON files are missing");
        }

        const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        const jsonGroupData = JSON.parse(
          fs.readFileSync(jsonGroupPath, "utf-8")
        );

        // Updated insert statement to include type and groupTest fields
        const insertStmt = this.db.prepare(`
          INSERT INTO tests (name, price, normal, options, isSelecte, type, groupTest)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertTransaction = this.db.transaction((data) => {
          for (const item of data) {
            const normalValue = item.normal
              ? item.normal.replace(/\\n/g, "\n")
              : null;

            // Set default values for missing fields
            const type = item.type || "single";
            const groupTest = item.groupTest || "[]";
            const isSelecte = item.isSelecte !== undefined ? item.isSelecte : 0;

            insertStmt.run(
              item.name,
              Number(item.price),
              normalValue,
              item.options || "[]",
              Number(isSelecte),
              type,
              groupTest
            );
          }
        });

        insertTransaction(jsonData);

        for (const item of jsonGroupData) {
          await this.addPackage({
            title: item?.groupname,
            customePrice: 0,
            tests: item?.testIds?.map((id) => ({ id })),
          });
        }

        console.log("Tests imported from tests.json");
      } else {
        console.log("Tests table is not empty, skipping import");
      }
    } catch (error) {
      console.error("Error importing tests from JSON:", error);
    }
    this.searchGroupTest();
  }

  async getPatients({ q = "", skip = 0, limit = 10 }) {
    // Prepare the query to count the total number of patients
    // Search by name or ID
    const countStmt = await this.db.prepare(`
      SELECT COUNT(*) as total
      FROM patients
      WHERE (name LIKE ? OR CAST(id AS TEXT) = ?)
        AND deletedAt IS NULL
    `);

    const countResult = countStmt.get(`%${q}%`, q);
    const total = countResult?.total || 0;

    const stmt = await this.db.prepare(`
      SELECT * FROM patients
      WHERE (name LIKE ? OR CAST(id AS TEXT) = ?)
        AND deletedAt IS NULL
      ORDER BY patients.id DESC
      LIMIT ? OFFSET ?
    `);

    const patients = stmt.all(`%${q}%`, q, limit, skip);

    return { success: true, total, data: patients };
  }

  async addPatient(patient) {
    const stmt = await this.db.prepare(`
      INSERT INTO patients (name, gender, email, phone, birth)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      patient.name,
      patient.gender,
      patient.email,
      patient.phone,
      new Date(patient.birth).toISOString()
    );
    this.markDirty("patients", info.lastInsertRowid);
    return { id: info.lastInsertRowid };
  }

  async deletePatient(id) {
    if (this.syncEnabled) {
      const visitIds = this.db
        .prepare(`SELECT id FROM visit_v2 WHERE patient_id = ? AND deletedAt IS NULL`)
        .all(id)
        .map((r) => r.id);
      for (const visitId of visitIds) this.softDelete("visit_item_v2", visitId, "visit_id");
      this.softDelete("visit_v2", id, "patient_id");
      const deleted = this.softDelete("patients", id);
      return { success: deleted > 0, rowsDeleted: deleted };
    }

    const checkVisitsStmt = await this.db.prepare(`
      DELETE FROM visit_v2 WHERE patient_id = ?
    `);
    const visits = await checkVisitsStmt.run(id);

    const deletePatientStmt = await this.db.prepare(`
      DELETE FROM patients WHERE id = ?
    `);

    const info = await deletePatientStmt.run(id);

    return { success: info.changes > 0, rowsDeleted: info.changes };
  }

  async updatePatient(id, updates) {
    const { name, gender, email, phone, birth } = updates;
    const stmt = await this.db.prepare(`
    UPDATE patients
    SET 
    name = COALESCE(?,name),
    gender = COALESCE(?, gender),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        birth = COALESCE(?, birth),
        updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
    `);
    const info = stmt.run(
      name,
      gender,
      email,
      phone,
      birth ? new Date(birth).toISOString() : null,
      id
    );
    if (info.changes > 0) this.markDirty("patients", id);

    return { data: info.changes > 0 };
  }

  async getDoctors({ q = "", skip = 0, limit = 10 }) {
    try {
      // Prepare the query to count the total number of doctors
      const countStmt = await this.db.prepare(`
      SELECT COUNT(*) as total
      FROM doctors
      WHERE name LIKE ? AND deletedAt IS NULL
    `);

      const countResult = countStmt.get(`%${q}%`);
      const total = countResult?.total || 0;

      const stmt = await this.db.prepare(`
      SELECT * FROM doctors
      WHERE name LIKE ? AND deletedAt IS NULL
      ORDER BY doctors.id DESC
      LIMIT ? OFFSET ?
    `);

      const doctors = stmt.all(`%${q}%`, limit, skip);

      return { success: true, total, data: doctors };
    } catch (error) {
      console.log(error);
    }
  }

  async addDoctor(doctors) {
    try {
      const stmt = await this.db.prepare(`
        INSERT INTO doctors (name, gender, email, phone, address, type,  doctor_fee, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        doctors.name,
        doctors.gender,
        doctors.email,
        doctors.phone,
        doctors.address,
        doctors.type,
        doctors.doctor_fee,
        doctors.note
      );
      this.markDirty("doctors", info.lastInsertRowid);
      return { id: info.lastInsertRowid };
    } catch (error) {
      console.log(error);
    }
  }

  async deleteDoctor(id) {
    if (this.syncEnabled) {
      const deleted = this.softDelete("doctors", id);
      return { success: deleted > 0, rowsDeleted: deleted };
    }

    const deleteDoctorStmt = await this.db.prepare(`
      DELETE FROM doctors WHERE id = ?
    `);

    const info = await deleteDoctorStmt.run(id);

    return { success: info.changes > 0, rowsDeleted: info.changes };
  }

  async updateDoctor(id, updates) {
    const { name, gender, email, phone, address, type, doctor_fee, note } =
      updates;
    const stmt = await this.db.prepare(`
    UPDATE doctors
    SET 
    name = COALESCE(?,name),
    gender = COALESCE(?, gender),
    email = COALESCE(?, email),
    phone = COALESCE(?, phone),
    address = COALESCE(?, address),
    type = COALESCE(?, type),
    doctor_fee = COALESCE(?, doctor_fee),
    note = COALESCE(?, note),
    updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
    `);
    const info = stmt.run(
      name,
      gender,
      email,
      phone,
      address,
      type,
      doctor_fee,
      note,
      id
    );
    if (info.changes > 0) this.markDirty("doctors", id);

    return { data: info.changes > 0 };
  }

  async addTest(test) {
    const {
      code,
      type = "single",
      name_en,
      name_ar,
      sample_type,
      unit,
      ref_text,
      meta_json = type === "single" ? { print: { layout: "single-line" } } : {},
      price_iqd = 0,
      is_active = true,
      version = "v1.0.0",
    } = test;

    const stmt = this.db.prepare(`
    INSERT INTO tests_catalog (
      code, type, name_en, name_ar,
      sample_type, unit, ref_text,
      meta_json, price_iqd, is_active, version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

    const info = stmt.run(
      code,
      type,
      name_en,
      name_ar || null,
      sample_type || null,
      // 👇 فقط لو single نخلي unit/ref_text، غيرها null
      type === "single" ? unit || null : null,
      type === "single" ? ref_text || null : null,
      typeof meta_json === "string" ? meta_json : JSON.stringify(meta_json),
      price_iqd,
      is_active ? 1 : 0,
      version
    );

    return { id: info.lastInsertRowid };
  }

  async deleteTest(id) {
    if (this.syncEnabled) {
      const deleted = this.softDelete("tests", id);
      return { success: deleted > 0 };
    }

    const stmt = await this.db.prepare(`
      DELETE FROM tests_catalog WHERE id = ?
    `);
    const info = stmt.run(id);
    return { success: info.changes > 0 };
  }

  async editTest(id, updates = {}) {
    let {
      code,
      type, // 'single' | 'panel' | 'composite'
      name_en,
      name_ar,
      sample_type,
      unit,
      ref_text,
      price_iqd,
      is_active, // boolean or 0/1
      version,
    } = updates;

    let unitToSet = unit === undefined ? undefined : unit ?? null;
    let refToSet = ref_text === undefined ? undefined : ref_text ?? null;

    if (type !== undefined && type !== "single") {
      if (unit === undefined) unitToSet = null;
      if (ref_text === undefined) refToSet = null;
    }

    // is_active normalization
    let isActiveToSet = undefined;
    if (is_active !== undefined) {
      isActiveToSet = is_active ? 1 : 0;
    }

    const sets = [];
    const params = [];
    const push = (clause, val) => {
      sets.push(clause);
      params.push(val);
    };

    if (code !== undefined) push("code = COALESCE(?, code)", code);
    if (type !== undefined) push("type = COALESCE(?, type)", type);
    if (name_en !== undefined) push("name_en = COALESCE(?, name_en)", name_en);
    if (name_ar !== undefined)
      push("name_ar = COALESCE(?, name_ar)", name_ar ?? null);
    if (sample_type !== undefined)
      push("sample_type = COALESCE(?, sample_type)", sample_type ?? null);
    if (unitToSet !== undefined) push("unit = COALESCE(?, unit)", unitToSet);
    if (refToSet !== undefined)
      push("ref_text = COALESCE(?, ref_text)", refToSet);
    if (price_iqd !== undefined)
      push("price_iqd = COALESCE(?, price_iqd)", price_iqd);
    if (isActiveToSet !== undefined)
      push("is_active = COALESCE(?, is_active)", isActiveToSet);
    if (version !== undefined)
      push("version = COALESCE(?, version)", version ?? null);

    if (sets.length === 0) {
      return { success: true, changes: 0 };
    }

    sets.push("updated_at = CURRENT_TIMESTAMP");

    const sql = `
    UPDATE tests_catalog
    SET ${sets.join(", ")}
    WHERE id = ?
  `;
    params.push(id);

    const stmt = this.db.prepare(sql);
    const info = stmt.run(...params);
    return { success: info.changes > 0, changes: info.changes };
  }

  async editTestMetaJson(id, meta) {
    const row = this.db
      .prepare(`SELECT id, type FROM tests_catalog WHERE id = ?`)
      .get(id);
    if (!row) {
      throw new Error(`Test with id=${id} not found`);
    }
    if (row.type === "single") {
      throw new Error(
        `meta_json is not applicable for type 'single' (id=${id})`
      );
    }

    let jsonString;
    if (typeof meta === "string") {
      try {
        JSON.parse(meta);
        jsonString = meta;
      } catch (e) {
        throw new Error("meta_json must be a valid JSON string");
      }
    } else {
      // (object/array/undefined/null) → stringify
      jsonString = JSON.stringify(meta ?? {});
    }

    // 3) نفّذ التحديث
    const stmt = this.db.prepare(`
    UPDATE tests_catalog
    SET meta_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
    const info = stmt.run(jsonString, id);

    return { success: info.changes > 0, changes: info.changes };
  }

  async getTests({ q = "", skip = 0, limit = 10 }) {
    try {
      const countStmt = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM tests_catalog
      WHERE code LIKE ?
         OR name_en LIKE ?
         OR name_ar LIKE ?
    `);

      const countResult = countStmt.get(`%${q}%`, `%${q}%`, `%${q}%`);
      const total = countResult?.total || 0;

      const stmt = this.db.prepare(`
      SELECT id, code, type, name_en, name_ar, sample_type, unit,
             ref_text, meta_json, price_iqd, is_active, version, created_at, updated_at
      FROM tests_catalog
      WHERE code LIKE ?
         OR name_en LIKE ?
         OR name_ar LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

      const tests = stmt.all(`%${q}%`, `%${q}%`, `%${q}%`, limit, skip);

      return { success: true, total, data: tests };
    } catch (error) {
      console.error("❌ Error in getCatalogTests:", error);
      return { success: false, total: 0, data: [] };
    }
  }

  async getTestsModal({ q = "", skip = 0, limit = 10000 }) {
    try {
      const countStmt = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM tests_catalog
      WHERE code LIKE ?
         OR name_en LIKE ?
         OR name_ar LIKE ?
    `);

      const countResult = countStmt.get(`%${q}%`, `%${q}%`, `%${q}%`);
      const total = countResult?.total || 0;

      const stmt = this.db.prepare(`
      SELECT id, type, code, name_en, name_ar, price_iqd, created_at
      FROM tests_catalog
      WHERE code LIKE ?
         OR name_en LIKE ?
         OR name_ar LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

      const tests = stmt.all(`%${q}%`, `%${q}%`, `%${q}%`, limit, skip);

      return { success: true, total, data: tests };
    } catch (error) {
      console.error("❌ Error in getCatalogTests:", error);
      return { success: false, total: 0, data: [] };
    }
  }

  async testByID(id) {
    const stmt = await this.db.prepare(`
      SELECT * FROM tests_catalog WHERE id = ?
    `);
    const test = stmt.get(id);
    console.log("test in db testByID", test);
    return { success: true, data: test };
  }

  async addPackage(data) {
    const { title, customePrice, tests } = data;

    if (!Array.isArray(tests)) {
      console.error("tests is not iterable:", tests);
      throw new TypeError("tests is not iterable");
    }

    const testIDs = tests.map((test) => test.id);

    const validTestIDs = [];
    for (const testID of testIDs) {
      const testExistsStmt = this.db.prepare(`
        SELECT id FROM tests WHERE id = ?
      `);
      const test = testExistsStmt.get(testID);
      if (test) {
        validTestIDs.push(testID);
      } else {
        console.warn(`Test ID ${testID} does not exist in the tests table.`);
      }
    }

    if (validTestIDs.length === 0) {
      throw new Error("No valid test IDs provided.");
    }

    const packageStmt = this.db.prepare(`
      INSERT INTO packages (title, customePrice)
      VALUES (?, ?)
    `);
    const packageInfo = packageStmt.run(title, customePrice);
    const packageID = packageInfo.lastInsertRowid;

    console.log(`Package added with ID: ${packageID}`);

    const testToPackageStmt = this.db.prepare(`
      INSERT INTO test_to_packages (packageID, testID)
      VALUES (?, ?)
    `);
    const testToPackageTransaction = this.db.transaction(() => {
      for (const testID of validTestIDs) {
        console.log(
          `Associating package ID ${packageID} with test ID ${testID}`
        );
        const linkInfo = testToPackageStmt.run(packageID, testID);
        this.markDirty("test_to_packages", linkInfo.lastInsertRowid);
      }
    });
    testToPackageTransaction();
    this.markDirty("packages", packageID);

    return { data: packageID };
  }

  async deletePackage(packageID) {
    if (this.syncEnabled) {
      const deleted = this.softDelete("packages", packageID);
      this.softDelete("test_to_packages", packageID, "packageID");
      if (deleted > 0) {
        return {
          success: true,
          message: `Package with ID ${packageID} deleted successfully.`,
        };
      }
      throw new Error(`Package with ID ${packageID} not found.`);
    }

    const deletePackageStmt = await this.db.prepare(`
      DELETE FROM packages
      WHERE id = ?
    `);
    const info = deletePackageStmt.run(packageID);
    if (info.changes > 0) {
      const deleteTestToPackage = await this.db.prepare(`
         DELETE FROM test_to_packages WHERE packageID = ?
        `);

      deleteTestToPackage.run(packageID);

      return {
        success: true,
        message: `Package with ID ${packageID} deleted successfully.`,
      };
    } else {
      throw new Error(`Package with ID ${packageID} not found.`);
    }
  }

  async editPackage(id, data) {
    try {
      const { title, customePrice } = data;
      const tests = data.tests.map((test) => test.id);

      const transaction = this.db.transaction(() => {
        const packageStmt = this.db.prepare(`
          UPDATE packages
          SET title = COALESCE(?, title), customePrice = COALESCE(?, customePrice), updatedAt = CURRENT_TIMESTAMP
          WHERE id = ? 
        `);

        // Ensure tests is an array, if it's empty then it should be null
        const testToPackage = this.db.prepare(`
          INSERT INTO test_to_packages (packageID, testID)
          VALUES (?, ?)
        `);

        packageStmt.run(title, customePrice, id);
        this.markDirty("packages", id);

        // Replace existing associations; under sync the old links must be
        // tombstoned so the removal reaches other PCs.
        if (this.syncEnabled) {
          this.softDelete("test_to_packages", id, "packageID");
        } else {
          const deleteTestToPackage = this.db.prepare(
            "DELETE FROM test_to_packages WHERE packageID = ?"
          );
          deleteTestToPackage.run(id);
        }

        // Insert new associations into 'test_to_packages' table
        for (const testID of tests) {
          const linkInfo = testToPackage.run(id, testID);
          this.markDirty("test_to_packages", linkInfo.lastInsertRowid);
        }
      });

      transaction();

      return {
        success: true,
        message: `Package with ID ${id} updated successfully.`,
      };
    } catch (error) {
      throw new Error(
        `Failed to update package with ID ${id}: ${error.message}`
      );
    }
  }

  async getPackages({ q = "", skip = 0, limit = 10 }) {
    // Prepare the query to count the total number of packages
    const countStmt = await this.db.prepare(`
      SELECT COUNT(*) as total
      FROM packages
      WHERE title LIKE ? AND deletedAt IS NULL
    `);

    const countResult = countStmt.get(`%${q}%`);
    const total = countResult?.total || 0;

    // Prepare the query to get the paginated results
    const stmt = await this.db.prepare(`
      SELECT * FROM packages
      WHERE title LIKE ? AND deletedAt IS NULL
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `);

    const packages = stmt.all(`%${q}%`, limit, skip);
    const packagesWithTests = packages.map((pkg) => {
      const testStmt = this.db.prepare(`
        SELECT t.*
        FROM tests t
        INNER JOIN test_to_packages tp ON t.id = tp.testID
        WHERE tp.packageID = ? AND tp.deletedAt IS NULL AND t.deletedAt IS NULL
      `);
      const tests = testStmt.all(pkg.id);
      return { ...pkg, tests };
    });

    return { success: true, total, data: packagesWithTests };
  }

  /**
   * Register a new visit (head + items) with pricing from tests_catalog only
   * tests: [{ id: number }, ...]
   */

  _generateUniqueVisitNumber() {
    // يحتاج dayjs (موجود عندك بالأعلى)
    const today = dayjs().format("YYMMDD");

    // جرّب أرقام عشوائية، وتأكد من عدم وجودها
    for (let i = 0; i < 5; i++) {
      const rand = Math.floor(100000 + Math.random() * 900000).toString(); // 6 أرقام
      const vn = `${today}-${rand}`;
      const exists = this.db
        .prepare(`SELECT 1 FROM visit_v2 WHERE visit_number = ? LIMIT 1`)
        .get(vn);
      if (!exists) return vn;
    }

    // Fallback: استخدم id القادم كجزء من الرقم
    const nextIdRow = this.db
      .prepare(`SELECT IFNULL(MAX(id), 0) + 1 AS n FROM visit_v2`)
      .get();
    const seq = String(nextIdRow.n).padStart(6, "0");
    return `${today}-${seq}`;
  }

  async registerVisitV2({
    patient_id,
    doctor_id = null, // optional
    tests = [],
    discount_iqd = 0,
    notes = null,
  }) {
    if (!Array.isArray(tests) || tests.length === 0) {
      throw new Error("No tests provided.");
    }

    // validate patient
    const p = this.db
      .prepare(`SELECT id FROM patients WHERE id = ?`)
      .get(patient_id);
    if (!p) throw new Error(`Patient ${patient_id} not found`);

    // doctor_id is optional → نتجاهل إذا ما موجود
    if (doctor_id != null) {
      const d = this.db
        .prepare(`SELECT id FROM doctors WHERE id = ?`)
        .get(doctor_id);
      if (!d) throw new Error(`Doctor ${doctor_id} not found`);
    }

    // fetch all required tests_catalog rows
    const ids = tests.map((t) => t.id);
    const ph = ids.map(() => "?").join(",");
    const fetched = this.db
      .prepare(`SELECT * FROM tests_catalog WHERE id IN (${ph})`)
      .all(...ids);

    if (fetched.length !== ids.length) {
      throw new Error("Some test IDs not found in catalog");
    }

    // resolve items
    const resolved = fetched.map((row) => ({
      row,
      unit: row.type === "single" ? row.unit ?? null : null,
      ref_text: row.type === "single" ? row.ref_text ?? null : null,
      meta_json: row.meta_json || "{}",
      price_iqd: Number(row.price_iqd ?? 0),
    }));

    const gross = resolved.reduce((s, x) => s + x.price_iqd, 0);
    const discount = Math.max(0, Number(discount_iqd || 0));
    const endPrice = Math.max(0, gross - discount);
    const visit_number = this._generateUniqueVisitNumber();

    const trx = this.db.transaction(() => {
      // insert visit head
      const vInfo = this.db
        .prepare(
          `
      INSERT INTO visit_v2
        (visit_number, patient_id, doctor_id, status, notes,
         gross_price_iqd, discount_iqd, end_price_iqd,
         paid_iqd, payment_status, created_at, updated_at, updatedAt)
      VALUES
        (?, ?, ?, 'PENDING', ?, ?, ?, ?, 0, 'UNPAID', datetime('now'), datetime('now'), datetime('now'))
    `
        )
        .run(
          visit_number,
          patient_id,
          doctor_id,
          notes,
          gross,
          discount,
          endPrice
        );
      const visit_id = vInfo.lastInsertRowid;
      this.markDirty("visit_v2", visit_id);

      // insert items
      const insItem = this.db.prepare(`
      INSERT INTO visit_item_v2
        (visit_id, test_id, code, type, name_en, name_ar, sample_type,
         unit, ref_text, price_iqd, is_active_catalog, meta_json,
         item_status, created_at, updated_at, updatedAt)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'), datetime('now'), datetime('now'))
    `);

      const createdItems = [];
      for (const x of resolved) {
        const t = x.row;
        const info = insItem.run(
          visit_id,
          t.id,
          t.code,
          t.type,
          t.name_en,
          t.name_ar,
          t.sample_type,
          x.unit,
          x.ref_text,
          x.price_iqd,
          t.is_active ?? 1,
          x.meta_json
        );
        this.markDirty("visit_item_v2", info.lastInsertRowid);
        createdItems.push({
          visit_item_id: info.lastInsertRowid,
          test_id: t.id,
          code: t.code,
          type: t.type,
          price_iqd: x.price_iqd,
        });
      }

      return {
        visit_id,
        visit_number,
        gross_price_iqd: gross,
        discount_iqd: discount,
        end_price_iqd: endPrice,
        items: createdItems,
      };
    });

    return { success: true, ...trx() };
  }

  async deleteVisit(id) {
    try {
      if (this.syncEnabled) {
        this.softDelete("visit_item_v2", id, "visit_id");
        const deleted = this.softDelete("visit_v2", id);
        return { success: deleted > 0, deleted };
      }

      // make sure FK cascades are enforced
      this.db.prepare(`PRAGMA foreign_keys = ON`).run();

      const stmt = this.db.prepare(`DELETE FROM visit_v2 WHERE id = ?`);
      const info = stmt.run(id);

      return { success: info.changes > 0, deleted: info.changes };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getVisits({
    q = "",
    skip = 0,
    limit = 10,
    startDate,
    endDate,
    status,
  }) {
    const whereClauses = [
      `(p.name LIKE ? OR v.visitNumber LIKE ?)`,
      `v.deletedAt IS NULL`,
      startDate
        ? `DATE(v.createdAt) >= '${dayjs(startDate)
            .startOf("day")
            .toISOString()}'`
        : "",
      endDate
        ? `DATE(v.createdAt) <= '${dayjs(endDate).endOf("day").toISOString()}'`
        : "",
      status && `v.status = '${status}'`,
    ]
      .filter(Boolean)
      .join(" AND ");

    const countStmt = await this.db.prepare(`
      SELECT COUNT(*) as total
      FROM visits v
      JOIN patients p ON v.patientID = p.id
      WHERE ${whereClauses}
    `);

    const countResult = countStmt.get(`%${q}%`, `%${q}%`);
    const total = countResult?.total || 0;

    const stmt = await this.db.prepare(`
      SELECT 
        v.*, 
        p.name as patientName, 
        p.gender as patientGender, 
        p.phone as patientPhone, 
        p.email as patientEmail, 
        p.birth as patientBirth,
        d.id as doctorID,
        d.name as doctorName, 
        d.gender as doctorGender, 
        d.phone as doctorPhone, 
        d.email as doctorEmail, 
        d.address as doctorAddress, 
        d.type as doctorType
      FROM visits v
      JOIN patients p ON v.patientID = p.id
      LEFT JOIN doctors d ON v.doctorId = d.id
      WHERE ${whereClauses}
      ORDER BY v.createdAt DESC
      LIMIT ${limit} OFFSET ${skip}
    `);

    const visits = stmt.all(`%${q}%`, `%${q}%`);

    const results = visits?.map((el) => {
      const doctorData = el?.doctorID
        ? {
            id: el?.doctorID,
            name: el?.doctorName,
            gender: el?.doctorGender,
            phone: el?.doctorPhone,
            email: el?.doctorEmail,
            address: el?.doctorAddress,
            type: el?.doctorType,
          }
        : null;

      return {
        id: el?.id,
        tests: JSON.parse(el?.tests) || [],
        testType: el?.testType,
        status: el?.status,
        discount: el?.discount,
        createdAt: el?.createdAt,
        updatedAt: el?.updatedAt,
        visitNumber: el?.visitNumber,
        patient: {
          id: el?.patientID,
          name: el?.patientName,
          gender: el?.patientGender,
          phone: el?.patientPhone,
          email: el?.patientEmail,
          birth: el?.patientBirth,
        },
        doctor: doctorData,
      };
    });

    return { success: true, total, data: results };
  }

  async getVisitsV2({
    q = "",
    skip = 0,
    limit = 10,
    startDate,
    endDate,
    status,
    minAge,
    maxAge,
    testId,
    gender,
  } = {}) {
    const whereClauses = [
      `(p.name LIKE ? OR v.visit_number LIKE ?)`,
      `v.deletedAt IS NULL`,
      startDate
        ? `DATE(v.created_at) >= '${dayjs(startDate)
            .startOf("day")
            .format("YYYY-MM-DD")}'`
        : "",
      endDate
        ? `DATE(v.created_at) <= '${dayjs(endDate)
            .endOf("day")
            .format("YYYY-MM-DD")}'`
        : "",
      status ? `v.status = ?` : "",
      gender ? `p.gender = '${gender}'` : "",
      minAge
        ? `(CAST(strftime('%Y','now') AS INT) - CAST(strftime('%Y',p.birth) AS INT)) >= ${Number(
            minAge
          )}`
        : "",
      maxAge
        ? `(CAST(strftime('%Y','now') AS INT) - CAST(strftime('%Y',p.birth) AS INT)) <= ${Number(
            maxAge
          )}`
        : "",
      testId
        ? `EXISTS (SELECT 1 FROM visit_item_v2 vi WHERE vi.visit_id = v.id AND vi.test_id = ${Number(
            testId
          )})`
        : "",
    ]
      .filter(Boolean)
      .join(" AND ");

    // Count
    const countSql = `
    SELECT COUNT(*) as total
    FROM visit_v2 v
    JOIN patients p ON v.patient_id = p.id
    LEFT JOIN doctors d ON v.doctor_id = d.id
    WHERE ${whereClauses}
  `;
    const countParams = [`%${q}%`, `%${q}%`];
    if (status) countParams.push(status);

    const countStmt = this.db.prepare(countSql);
    const countResult = countStmt.get(...countParams);
    const total = countResult?.total || 0;

    // Visits
    const rowsSql = `
    SELECT 
      v.*,
      p.name  AS patientName,
      p.gender AS patientGender,
      p.phone AS patientPhone,
      p.email AS patientEmail,
      p.birth AS patientBirth,
      d.id    AS doctorID,
      d.name  AS doctorName,
      d.gender AS doctorGender,
      d.phone  AS doctorPhone,
      d.email  AS doctorEmail,
      d.address AS doctorAddress,
      d.type    AS doctorType
    FROM visit_v2 v
    JOIN patients p ON v.patient_id = p.id
    LEFT JOIN doctors d ON v.doctor_id = d.id
    WHERE ${whereClauses}
    ORDER BY v.created_at DESC
    LIMIT ${limit} OFFSET ${skip}
  `;
    const rowsParams = [`%${q}%`, `%${q}%`];
    if (status) rowsParams.push(status);

    const visitsHdr = this.db.prepare(rowsSql).all(...rowsParams);

    // Items
    let itemsMap = {};
    const visitIds = visitsHdr.map((v) => v.id);
    if (visitIds.length > 0) {
      const placeholders = visitIds.map(() => "?").join(",");
      const items = this.db
        .prepare(
          `
        SELECT
          i.visit_id,
          i.id AS visit_item_id,
          i.test_id,
          i.code,
          i.type,
          i.name_en,
          i.name_ar,
          i.sample_type,
          i.unit,
          i.ref_text,
          i.price_iqd,
          i.meta_json,
          i.result_json,
          i.created_at,
          i.updated_at
        FROM visit_item_v2 i
        WHERE i.visit_id IN (${placeholders}) AND i.deletedAt IS NULL
        ORDER BY i.id ASC
      `
        )
        .all(...visitIds);

      itemsMap = items.reduce((acc, it) => {
        if (!acc[it.visit_id]) acc[it.visit_id] = [];
        acc[it.visit_id].push({
          visit_item_id: it.visit_item_id,
          test_id: it.test_id,
          code: it.code,
          type: it.type,
          name_en: it.name_en,
          name_ar: it.name_ar,
          sample_type: it.sample_type,
          unit: it.unit,
          ref_text: it.ref_text,
          price_iqd: it.price_iqd,
          meta_json: it.meta_json,
          result_json: it.result_json ? JSON.parse(it.result_json) : null,
          created_at: it.created_at,
          updated_at: it.updated_at,
        });
        return acc;
      }, {});
    }

    // Result
    const results = visitsHdr.map((el) => {
      const doctorData = el?.doctorID
        ? {
            id: el.doctorID,
            name: el.doctorName,
            gender: el.doctorGender,
            phone: el.doctorPhone,
            email: el.doctorEmail,
            address: el.doctorAddress,
            type: el.doctorType,
          }
        : null;

      return {
        id: el.id,
        visitNumber: el.visit_number,
        status: el.status,
        notes: el.notes,
        grossPrice: el.gross_price_iqd,
        discount: el.discount_iqd,
        endPrice: el.end_price_iqd,
        paid: el.paid_iqd,
        paymentStatus: el.payment_status,

        createdAt: el.created_at,
        updatedAt: el.updated_at,

        patient: {
          id: el.patient_id,
          name: el.patientName,
          gender: el.patientGender,
          phone: el.patientPhone,
          email: el.patientEmail,
          birth: el.patientBirth,
        },

        doctor: doctorData,
        tests: itemsMap[el.id] || [],
      };
    });

    return { success: true, total, data: results };
  }

  async saveVisitResults(items) {
    // items: [{ visit_item_id, result_json, item_status }, ...]
    if (!Array.isArray(items) || items.length === 0) {
      return { success: true, updated: 0 };
    }

    // 1) infer visit_id from first item
    const firstId = items[0].visit_item_id;
    const row = this.db
      .prepare(`SELECT visit_id FROM visit_item_v2 WHERE id = ?`)
      .get(firstId);
    if (!row) throw new Error(`visit_item_v2 not found: ${firstId}`);
    const visit_id = row.visit_id;

    // 2) ensure all items belong to the same visit (guard)
    const inClause = items.map(() => "?").join(",");
    const parentCheck = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM visit_item_v2 WHERE id IN (${inClause}) AND visit_id = ?`
      )
      .get(...items.map((i) => i.visit_item_id), visit_id);
    if (parentCheck.c !== items.length) {
      throw new Error(
        `Some items do not belong to the same visit (${visit_id}).`
      );
    }

    // 3) batch update
    const upd = this.db.prepare(`
    UPDATE visit_item_v2
       SET result_json = ?,
           updated_at = CURRENT_TIMESTAMP,
           updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?
  `);

    const tx = this.db.transaction((rows) => {
      rows.forEach(({ visit_item_id, result_json }) => {
        const payload = JSON.stringify(result_json || {});
        upd.run(payload, visit_item_id);
      });
    });

    tx(items);
    items.forEach(({ visit_item_id }) => this.markDirty("visit_item_v2", visit_item_id));

    // 4) recalc parent status
    await this.updateVisitStatusV2(visit_id);

    return { success: true, updated: items.length, visit_id };
  }

  // helper: نتيجة ذات معنى؟
  _isMeaningfulResultJSON(val) {
    if (!val || typeof val !== "object") return false;

    // single
    if ("result" in val) {
      return String(val.result ?? "").trim() !== "";
    }

    // panel
    if ("items" in val && val.items && typeof val.items === "object") {
      const cells = Object.values(val.items);
      return cells.some((c) => String(c?.result ?? "").trim() !== "");
    }

    // composite
    if ("sections" in val && val.sections && typeof val.sections === "object") {
      const secs = Object.values(val.sections);
      return secs.some((fields) =>
        Object.values(fields || {}).some((v) => String(v ?? "").trim() !== "")
      );
    }

    return false;
  }

  async updateVisitStatusV2(visit_id) {
    // 1) جيب كل الآيتمات للزيارة
    const items = this.db
      .prepare(
        `
    SELECT id, type, result_json
    FROM visit_item_v2
    WHERE visit_id = ?
  `
      )
      .all(visit_id);

    const total = items.length;
    if (total === 0) {
      // ماكو تحاليل → نعتبرها PENDING
      this.db
        .prepare(
          `
      UPDATE visit_v2
         SET status = 'PENDING',
             updated_at = CURRENT_TIMESTAMP,
             updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?
    `
        )
        .run(visit_id);
      this.markDirty("visit_v2", visit_id);
      return { success: true, status: "PENDING", total, completed: 0 };
    }

    // 2) عدّ التحاليل اللي عدها نتيجة ذات معنى
    let completed = 0;
    for (const it of items) {
      let parsed = null;
      if (it.result_json && typeof it.result_json === "string") {
        try {
          parsed = JSON.parse(it.result_json);
        } catch {
          parsed = null;
        }
      } else if (it.result_json && typeof it.result_json === "object") {
        parsed = it.result_json;
      }
      if (this._isMeaningfulResultJSON(parsed)) completed += 1;
    }

    // 3) حدد حالة الزيارة
    let status = "PENDING";
    if (completed === 0) status = "PENDING";
    else if (completed === total) status = "COMPLETED";
    else status = "PARTIAL";

    // 4) حدّث الزيارة
    this.db
      .prepare(
        `
    UPDATE visit_v2
       SET status = ?, updated_at = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?
  `
      )
      .run(status, visit_id);
    this.markDirty("visit_v2", visit_id);

    return { success: true, status, total, completed };
  }

  async getVisitTotals({
    startDate,
    endDate,
    status,
    gender, // 'male' | 'female' | 'm' | 'f' | ['male','female']
    minAge, // أقدم عمر (سنوات)
    maxAge, // أصغر عمر (سنوات)
    testId,
  } = {}) {
    // --- Normalize gender to array of 'male'/'female'
    let genderList = [];
    if (Array.isArray(gender)) {
      genderList = gender
        .map((g) => String(g).trim().toLowerCase())
        .map((g) => (g === "m" ? "male" : g === "f" ? "female" : g))
        .filter((g) => g === "male" || g === "female");
    } else if (typeof gender === "string" && gender.trim()) {
      const g = gender.trim().toLowerCase();
      const norm = g === "m" ? "male" : g === "f" ? "female" : g;
      if (norm === "male" || norm === "female") genderList = [norm];
    }

    const needPatientJoin =
      genderList.length > 0 ||
      Number.isFinite(minAge) ||
      Number.isFinite(maxAge);

    const where = [];
    const params = [];

    // Date range on visit.created_at
    if (startDate) {
      where.push("datetime(v.created_at) >= datetime(?)");
      params.push(startDate);
    }
    if (endDate) {
      where.push("datetime(v.created_at) <= datetime(?)");
      params.push(endDate);
    }

    // Visit status
    if (status) {
      where.push("v.status = ?");
      params.push(status);
    }

    // Gender filter
    if (genderList.length > 0) {
      const ph = genderList.map(() => "?").join(",");
      where.push(`LOWER(p.gender) IN (${ph})`);
      params.push(...genderList);
    }

    // Age filters (using precise day-based calc via julianday)
    // NOTE: إذا عندك p.birth = NULL راح تُستبعد عندما تطلب عمر
    if (Number.isFinite(minAge)) {
      where.push(`( (julianday('now') - julianday(p.birth)) / 365.25 ) >= ?`);
      params.push(Number(minAge));
    }
    if (Number.isFinite(maxAge)) {
      where.push(`( (julianday('now') - julianday(p.birth)) / 365.25 ) <= ?`);
      params.push(Number(maxAge));
    }

    // testId filter
    if (Number.isFinite(testId)) {
      where.push(`
      EXISTS (
        SELECT 1
        FROM visit_item_v2 vi
        WHERE vi.visit_id = v.id
          AND vi.test_id = ?
      )
    `);
      params.push(Number(testId));
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
    SELECT
      COALESCE(SUM(v.gross_price_iqd), 0) AS subTotalAmount,
      COALESCE(SUM(v.discount_iqd), 0)    AS totalDiscount,
      COALESCE(SUM(v.end_price_iqd), 0)   AS totalAmount,
      COUNT(*)                            AS totalVisits
    FROM visit_v2 v
    ${needPatientJoin ? "JOIN patients p ON p.id = v.patient_id" : ""}
    ${whereSql}
  `;

    const row = this.db.prepare(sql).get(...params) || {};

    return {
      success: true,
      subTotalAmount: Number(row.subTotalAmount || 0),
      totalDiscount: Number(row.totalDiscount || 0),
      totalAmount: Number(row.totalAmount || 0),
      totalVisits: Number(row.totalVisits || 0),
    };
  }

  async getTestNormalValues(testType, testsFromVisit) {
    let testIds =
      testType === "PACKAGE"
        ? testsFromVisit.map((pkg) => pkg.tests.map((test) => test.id)).flat()
        : testsFromVisit.map((el) => el.id);

    const placeholders = testIds.map(() => "?").join(",");
    const stmtTests = await this.db.prepare(`
          SELECT t.*
          FROM tests t
          WHERE t.id IN (${placeholders})
        `);

    const tests = stmtTests.all(...testIds);
    let newTests = testsFromVisit.map((el) => {
      if (testType === "PACKAGE") {
        el.tests = el.tests.map((pkg) => {
          pkg.normal = tests.find((t) => t.id === pkg.id)?.normal;
          return pkg;
        });
      } else {
        el.normal = tests.find((t) => t.id === el.id)?.normal;
      }
      return el;
    });

    return newTests;
  }

  async getTotalVisits({ startDate, endDate }) {
    try {
      let query = `SELECT COUNT(*) as total FROM visits v`;
      let params = [];

      const whereClauses = [`v.deletedAt IS NULL`];

      if (startDate) {
        whereClauses.push(`strftime('%Y-%m-%d', v.createdAt) >= ?`);
        params.push(dayjs(startDate).format("YYYY-MM-DD"));
      }

      if (endDate) {
        whereClauses.push(`strftime('%Y-%m-%d', v.createdAt) <= ?`);
        params.push(dayjs(endDate).format("YYYY-MM-DD"));
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }

      const countStmt = await this.db.prepare(query);
      const countResult = countStmt.get(...params);
      const total = countResult?.total || 0;

      console.log("✅ getTotalVisits result:", { query, params, total });

      return { success: true, total };
    } catch (error) {
      console.error("Error getting total visits:", error);
      return { success: false, total: 0 };
    }
  }

  async getTotalPatients() {
    try {
      // First, let's see what patients exist
      const allPatientsStmt = await this.db.prepare(`
        SELECT id, name FROM patients LIMIT 5
      `);
      const allPatients = allPatientsStmt.all();
      console.log("🔍 Patients in DB:", allPatients);

      const countStmt = await this.db.prepare(`
        SELECT COUNT(*) as total FROM patients WHERE deletedAt IS NULL
      `);

      const countResult = countStmt.get();
      const total = countResult?.total || 0;

      console.log("✅ getTotalPatients result:", total);

      return { success: true, total };
    } catch (error) {
      console.error("❌ Error getting total patients:", error);
      return { success: false, total: 0 };
    }
  }

  async getTodayVisits() {
    try {
      // Use strftime for proper date comparison in SQLite
      const today = dayjs().format("YYYY-MM-DD");

      const countStmt = await this.db.prepare(`
        SELECT COUNT(*) as total
        FROM visit_v2 v
        WHERE strftime('%Y-%m-%d', v.created_at) = ?
      `);

      const countResult = countStmt.get(today);
      const total = countResult?.total || 0;

      console.log("✅ getTodayVisits result:", { today, total });

      return { success: true, total };
    } catch (error) {
      console.error("❌ Error getting today's visits:", error);
      return { success: false, total: 0 };
    }
  }

  async getPendingResults() {
    try {
      // First, let's see what visits exist and their statuses
      // const allVisitsStmt = await this.db.prepare(`
      //   SELECT id, status, strftime('%Y-%m-%d', created_at) as date FROM visit_v2 LIMIT 10
      // `);
      // const allVisits = allVisitsStmt.all();
      // console.log("🔍 Visits in DB:", allVisits);

      const countStmt = await this.db.prepare(`
        SELECT COUNT(*) as total
        FROM visit_v2 v
        WHERE v.status = 'PENDING'
      `);

      const countResult = countStmt.get();
      const total = countResult?.total || 0;

      console.log("✅ getPendingResults result:", total);

      return { success: true, total };
    } catch (error) {
      console.error("❌ Error getting pending results:", error);
      return { success: false, total: 0 };
    }
  }

  async getVisitByPatient(patientId) {
    const stmt = await this.db.prepare(`
      SELECT 
        v.*, 
        p.name as patientName, 
        p.gender as patientGender, 
        p.phone as patientPhone, 
        p.email as patientEmail,  
        p.birth as patientBirth,
        d.id as doctorID,
        d.name as doctorName, 
        d.gender as doctorGender, 
        d.phone as doctorPhone, 
        d.email as doctorEmail, 
        d.address as doctorAddress, 
        d.type as doctorType
      FROM visit_v2 v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN doctors d ON v.doctor_id = d.id
      WHERE v.patient_id = ?
      ORDER BY v.created_at DESC
    `);

    const visits = stmt.all(patientId);

    let itemsMap = {};
    const visitIds = visits.map((v) => v.id);
    if (visitIds.length > 0) {
      const placeholders = visitIds.map(() => "?").join(",");
      const items = this.db
        .prepare(
          `
        SELECT 
          i.visit_id,
          i.id AS visit_item_id,
          i.test_id,
          i.code,
          i.type,
          i.name_en,
          i.name_ar,
          i.sample_type,
          i.unit,
          i.ref_text,
          i.price_iqd,
          i.meta_json,
          i.result_json,
          i.created_at,
          i.updated_at
        FROM visit_item_v2 i
        WHERE i.visit_id IN (${placeholders})
        ORDER BY i.id ASC
      `
        )
        .all(...visitIds);

      itemsMap = items.reduce((acc, it) => {
        if (!acc[it.visit_id]) acc[it.visit_id] = [];
        acc[it.visit_id].push({
          id: it.test_id,
          visit_item_id: it.visit_item_id,
          code: it.code,
          type: it.type,
          title: it.name_en,
          name_en: it.name_en,
          name_ar: it.name_ar,
          sample_type: it.sample_type,
          unit: it.unit,
          ref_text: it.ref_text,
          price_iqd: it.price_iqd,
          meta_json: it.meta_json,
          result_json: it.result_json ? JSON.parse(it.result_json) : null,
          created_at: it.created_at,
          updated_at: it.updated_at,
        });
        return acc;
      }, {});
    }

    const results = visits?.map((el) => {
      const doctorData = el?.doctorID
        ? {
            id: el?.doctorID,
            name: el?.doctorName,
            gender: el?.doctorGender,
            phone: el?.doctorPhone,
            email: el?.doctorEmail,
            address: el?.doctorAddress,
            type: el?.doctorType,
          }
        : null;

      return {
        id: el?.id,
        tests: itemsMap[el.id] || [],
        testType: "CUSTOME", // Default to CUSTOME for new v2 visits
        status: el?.status,
        discount: el?.discount_iqd,
        createdAt: el?.created_at,
        updatedAt: el?.updated_at,
        visitNumber: el?.visit_number,
        patient: {
          id: el?.patient_id,
          name: el?.patientName,
          gender: el?.patientGender,
          phone: el?.patientPhone,
          email: el?.patientEmail,
          birth: el?.patientBirth,
        },
        doctor: doctorData,
      };
    });

    return { success: true, data: results };
  }

  async getVisitByDoctor(doctorId, startDate = null, endDate = null) {
    try {
      const where = [`v.doctor_id = ?`]; // always filter by doctor_id
      const params = [doctorId];

      if (startDate) {
        where.push(`DATE(v.created_at) >= DATE(?)`);
        params.push(dayjs(startDate).startOf("day").format("YYYY-MM-DD"));
      }
      if (endDate) {
        where.push(`DATE(v.created_at) <= DATE(?)`);
        params.push(dayjs(endDate).endOf("day").format("YYYY-MM-DD"));
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      // 1) نجيب الزيارات مع معلومات المريض والدكتور
      const stmt = this.db.prepare(`
      SELECT 
        v.*,
        p.name   AS patientName, 
        p.gender AS patientGender, 
        p.phone  AS patientPhone, 
        p.email  AS patientEmail,  
        p.birth  AS patientBirth,
        d.id     AS doctorID,
        d.name   AS doctorName, 
        d.gender AS doctorGender, 
        d.phone  AS doctorPhone, 
        d.email  AS doctorEmail, 
        d.address AS doctorAddress, 
        d.type    AS doctorType,
        d.doctor_fee AS doctorFee
      FROM visit_v2 v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN doctors d ON v.doctor_id = d.id
      ${whereSql}
      ORDER BY v.created_at DESC
    `);

      const visitsHdr = stmt.all(...params);

      // 2) نجيب الاختبارات لكل زيارة
      let itemsMap = {};
      const visitIds = visitsHdr.map((v) => v.id);
      if (visitIds.length > 0) {
        const placeholders = visitIds.map(() => "?").join(",");
        const items = this.db
          .prepare(
            `
          SELECT 
            i.visit_id,
            i.id AS visit_item_id,
            i.test_id,
            i.code,
            i.type,
            i.name_en,
            i.name_ar,
            i.sample_type,
            i.unit,
            i.ref_text,
            i.price_iqd,
            i.meta_json,
            i.result_json,
            i.created_at,
            i.updated_at
          FROM visit_item_v2 i
          WHERE i.visit_id IN (${placeholders})
          ORDER BY i.id ASC
        `
          )
          .all(...visitIds);

        itemsMap = items.reduce((acc, it) => {
          if (!acc[it.visit_id]) acc[it.visit_id] = [];
          acc[it.visit_id].push({
            visit_item_id: it.visit_item_id,
            test_id: it.test_id,
            code: it.code,
            type: it.type,
            name_en: it.name_en,
            name_ar: it.name_ar,
            sample_type: it.sample_type,
            unit: it.unit,
            ref_text: it.ref_text,
            price_iqd: it.price_iqd,
            meta_json: it.meta_json,
            result_json: it.result_json ? JSON.parse(it.result_json) : null,
            created_at: it.created_at,
            updated_at: it.updated_at,
          });
          return acc;
        }, {});
      }

      // 3) نكوّن النتيجة النهائية
      const results = visitsHdr.map((el) => {
        const doctorData = el?.doctorID
          ? {
              id: el?.doctorID,
              name: el?.doctorName,
              gender: el?.doctorGender,
              phone: el?.doctorPhone,
              email: el?.doctorEmail,
              address: el?.doctorAddress,
              type: el?.doctorType,
              doctor_fee: el?.doctorFee || 0,
            }
          : null;

        return {
          ...el,

          patient: {
            id: el.patient_id,
            name: el.patientName,
            gender: el.patientGender,
            phone: el.patientPhone,
            email: el.patientEmail,
            birth: el.patientBirth,
          },

          doctor: doctorData,

          tests: itemsMap[el.id] || [],
        };
      });

      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async updateVisitV2(id, updates = {}) {
    const {
      patient_id,
      doctor_id,
      discount_iqd,
      tests, // optional: [{id}, ...] => replace items
    } = updates;
    try {
      // تأكد الزيارة موجودة
      const visitRow = this.db
        .prepare(`SELECT * FROM visit_v2 WHERE id = ?`)
        .get(id);
      if (!visitRow) {
        throw new Error(`visit_v2 not found: ${id}`);
      }

      const tx = this.db.transaction(() => {
        // 1) إذا انطيت tests، نستبدل قائمة التحاليل بالكامل (diff add/remove)
        if (Array.isArray(tests)) {
          const incomingIds = tests
            .map((t) => Number(t?.id))
            .filter((n) => Number.isFinite(n));

          // التحاليل الحالية
          const current = this.db
            .prepare(`SELECT test_id FROM visit_item_v2 WHERE visit_id = ?`)
            .all(id)
            .map((r) => r.test_id);

          const toAdd = incomingIds.filter((x) => !current.includes(x));
          const toDel = current.filter((x) => !incomingIds.includes(x));

          // احذف الزائد
          if (toDel.length) {
            const qMarks = toDel.map(() => "?").join(",");
            const idsToDel = this.db
              .prepare(
                `SELECT id FROM visit_item_v2 WHERE visit_id = ? AND test_id IN (${qMarks})`
              )
              .all(id, ...toDel)
              .map((r) => r.id);
            if (this.syncEnabled) {
              for (const itemId of idsToDel) this.softDelete("visit_item_v2", itemId);
            } else {
              this.db
                .prepare(
                  `DELETE FROM visit_item_v2 WHERE visit_id = ? AND test_id IN (${qMarks})`
                )
                .run(id, ...toDel);
            }
          }

          // أضف الجديد: ناخذ سنابشوت من tests_catalog
          if (toAdd.length) {
            const qMarks = toAdd.map(() => "?").join(",");
            const tcRows = this.db
              .prepare(
                `SELECT id AS test_id, code, type, name_en, name_ar, sample_type, unit, ref_text, price_iqd, is_active AS is_active_catalog, meta_json
             FROM tests_catalog
            WHERE id IN (${qMarks})`
              )
              .all(...toAdd);

            const ins = this.db.prepare(`
              INSERT INTO visit_item_v2
              (visit_id, test_id, code, type, name_en, name_ar, sample_type, unit, ref_text,
              price_iqd, is_active_catalog, meta_json,
              result_value, result_numeric, result_unit, result_json, is_abnormal,
              technician_name, method, completed_at, printed_at, updatedAt)
              VALUES
              (?,?,?,?,?,?,?,?,?,
              ?,?,?,?,?,?,?,
              0,
              NULL,NULL,NULL,NULL, datetime('now'))
            `);

            tcRows.forEach((r) => {
              const info = ins.run(
                id, // visit_id
                r.test_id, // test_id
                r.code, // code
                r.type, // type
                r.name_en, // name_en
                r.name_ar || null, // name_ar
                r.sample_type || null, // sample_type
                r.unit || null, // unit
                r.ref_text || null, // ref_text

                Number(r.price_iqd || 0), // price_iqd
                Number(r.is_active_catalog || 1), // is_active_catalog
                r.meta_json || "{}", // meta_json
                null, // result_value
                null, // result_numeric
                null, // result_unit
                null // result_json
                // ثم الثوابت: 0, NULL, NULL, NULL, NULL
              );
              this.markDirty("visit_item_v2", info.lastInsertRowid);
            });
          }
        }

        // 2) أعد حساب الأسعار (gross/end)
        const sumRow = this.db
          .prepare(
            `SELECT COALESCE(SUM(price_iqd),0) AS gross FROM visit_item_v2 WHERE visit_id = ?`
          )
          .get(id);
        const gross = Number(sumRow?.gross || 0);
        const discount =
          discount_iqd !== undefined
            ? Math.max(0, Number(discount_iqd) || 0)
            : Number(visitRow.discount_iqd || 0);
        const endPrice = Math.max(0, gross - discount);

        // 3) نبني UPDATE ديناميكي للزيارة
        const sets = [];
        const params = [];
        const push = (clause, val) => {
          sets.push(clause);
          params.push(val);
        };

        if (patient_id !== undefined)
          push(`patient_id = COALESCE(?, patient_id)`, patient_id);
        if (doctor_id !== undefined)
          push(`doctor_id  = ?`, doctor_id === null ? null : doctor_id);

        // الأسعار دائمًا تتحدث بعد أي تغيير
        push(`gross_price_iqd = ?`, gross);
        push(`discount_iqd    = ?`, discount);
        push(`end_price_iqd   = ?`, endPrice);

        sets.push(`updated_at = CURRENT_TIMESTAMP`);
        sets.push(`updatedAt = CURRENT_TIMESTAMP`);

        const sql = `UPDATE visit_v2 SET ${sets.join(", ")} WHERE id = ?`;
        this.db.prepare(sql).run(...params, id);

        return { gross, discount, endPrice };
      });

      const res = tx();
      await this.updateVisitStatusV2(id);

      return {
        success: true,
        totals: {
          gross: res.gross,
          discount: res.discount,
          endPrice: res.endPrice,
        },
      };
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: "Update failed !.",
      };
    }
  }

  async getVisitDetails(visitId) {
    try {
      if (!this.db) {
        console.error("Database not initialized");
        return null;
      }
      console.log(`Attempting to fetch visit with id: ${visitId}`);

      const stmt = await this.db.prepare(`
        SELECT v.*, p.name as patientName
        FROM visit_v2 v
        JOIN patients p ON v.patientId = p.id
        WHERE v.id = ?
      `);

      const visit = stmt.get(visitId);
      console.log("Raw visit data:", JSON.stringify(visit, null, 2));

      if (visit) {
        return {
          id: visit.id,
          visitNumber: visit.visitNumber,
          patient: {
            name: visit.patientName,
          },
        };
      }

      return null;
    } catch (error) {
      console.error("Error fetching visit details:", error);
      return null;
    }
  }

  async exportDatabase() {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Export SQLite Database",
      defaultPath: "drlab-backup.sql",
      filters: [{ name: "SQLite Database", extensions: ["sqlite3", "db"] }],
    });

    if (canceled || !filePath) {
      return {
        success: false,
        message: "Export canceled.",
      };
    }
    try {
      await this.db.backup(filePath);

      return {
        success: true,
        message: "Database exported.",
      };
    } catch (error) {
      return {
        success: false,
        message: "Export failed !.",
      };
    }
  }

  async importDatabase() {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: "Import SQLite Database",
      properties: ["openFile"],
      filters: [{ name: "SQLite Database", extensions: ["sqlite3", "db"] }],
    });

    if (canceled || !filePaths) {
      return {
        success: false,
        message: "Export canceled.",
      };
    }

    const { response } = await dialog.showMessageBox({
      type: "question",
      buttons: ["Restart Now", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      title: "Restart Required",
      message:
        "To complete the import, the app needs to restart.\nDo you want to restart now?",
    });

    if (response !== 0) {
      return { success: false, message: "Restart canceled by user." };
    }
    const pendingPath = path.join(
      path.dirname(this.dbPath),
      "drlab.import-pending.db"
    );
    try {
      const importPath = filePaths[0];
      fs.copyFileSync(importPath, pendingPath);
      app.relaunch();
      app.exit(0);
      return;
    } catch (error) {
      console.log(error);
      return {
        success: false,
        message: "Import failed !.",
      };
    }
  }

  async handlePendingImport() {
    const dir = path.dirname(this.dbPath);
    const pendingPath = path.join(dir, "drlab.import-pending.db");

    try {
      fs.accessSync(pendingPath);
      fs.copyFileSync(pendingPath, this.dbPath);
      fs.unlinkSync(pendingPath);

      console.log("✅ Imported pending database on startup.");
      return true;
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error("❌ Failed to apply pending import:", err);
      }
      return false;
    }
  }

  // Called from Settings ("Leave this lab") after the server confirms this
  // device is disconnected from the current clientId. The db file can't be
  // deleted while this process still has it open (fails outright on
  // Windows), so — same trick as importDatabase — we drop a marker, relaunch,
  // and let the next cold start (before any Database handle is opened) do
  // the actual deletion via handlePendingWipe().
  async requestDataWipe() {
    const dir = path.dirname(this.dbPath);
    const markerPath = path.join(dir, "drlab.wipe-pending");
    try {
      if (this.db) {
        try {
          this.db.close();
        } catch (_) {
          // Already closed or never opened — fine, we're wiping it anyway.
        }
      }
      fs.writeFileSync(markerPath, "");
      app.relaunch();
      app.exit(0);
      return;
    } catch (error) {
      console.error("❌ Failed to schedule local data wipe:", error);
      return {
        success: false,
        message: "Failed to schedule local data wipe.",
      };
    }
  }

  async handlePendingWipe() {
    const dir = path.dirname(this.dbPath);
    const markerPath = path.join(dir, "drlab.wipe-pending");

    try {
      fs.accessSync(markerPath);
    } catch (err) {
      return false; // No wipe scheduled — normal startup.
    }

    // Everything this lab could have left on disk: the live db (+ WAL/SHM
    // sidecar files), the one-time pre-sync safety backup, and any
    // in-flight import that never got applied.
    const filesToRemove = [
      this.dbPath,
      `${this.dbPath}-wal`,
      `${this.dbPath}-shm`,
      path.join(dir, "drlab.pre-sync-backup.db"),
      path.join(dir, "drlab.import-pending.db"),
    ];

    for (const file of filesToRemove) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (error) {
        console.error(`❌ Failed to remove ${file} during data wipe:`, error);
      }
    }

    try {
      fs.unlinkSync(markerPath);
    } catch (_) {
      // Non-fatal — worst case we wipe an already-empty db again next boot.
    }

    console.log("✅ Local data wiped — left previous lab.");
    return true;
  }
}

module.exports = { LabDB, SYNCED_TABLES, setGlobalSyncEnabled };
