const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Ensure data directory exists for embedded storage fallback
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let activePool = null;
let dbEngine = 'mysql';

function createSqliteCompatibilityPool() {
  const Database = require('better-sqlite3');
  const dbPath = path.join(dataDir, 'aicte_casesync.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Initialize SQLite schema and initial seeds if not present
  initializeSqliteTables(sqlite);

  return {
    engine: 'sqlite',
    async query(sql, params = []) {
      const cleanSql = transformMysqlToSqlite(sql);
      const isSelect = /^\s*SELECT/i.test(cleanSql);
      const isInsert = /^\s*INSERT/i.test(cleanSql);
      const isUpdateOrDelete = /^\s*(UPDATE|DELETE)/i.test(cleanSql);

      try {
        if (isSelect) {
          const stmt = sqlite.prepare(cleanSql);
          const rows = stmt.all(...params);
          return [rows, []];
        } else if (isInsert) {
          const stmt = sqlite.prepare(cleanSql);
          const info = stmt.run(...params);
          return [{ insertId: Number(info.lastInsertRowid), affectedRows: info.changes }, []];
        } else if (isUpdateOrDelete) {
          const stmt = sqlite.prepare(cleanSql);
          const info = stmt.run(...params);
          return [{ affectedRows: info.changes }, []];
        } else {
          sqlite.exec(cleanSql);
          return [{}, []];
        }
      } catch (err) {
        console.error(`[SQLite Error] on query "${cleanSql}":`, err.message);
        throw err;
      }
    },
    async getConnection() {
      // In SQLite, wrap in a transaction context
      return {
        async beginTransaction() {
          sqlite.exec('BEGIN IMMEDIATE');
        },
        async query(sql, params = []) {
          const cleanSql = transformMysqlToSqlite(sql);
          const isSelect = /^\s*SELECT/i.test(cleanSql);
          const isInsert = /^\s*INSERT/i.test(cleanSql);

          if (isSelect) {
            const stmt = sqlite.prepare(cleanSql);
            return [stmt.all(...params), []];
          } else if (isInsert) {
            const stmt = sqlite.prepare(cleanSql);
            const info = stmt.run(...params);
            return [{ insertId: Number(info.lastInsertRowid), affectedRows: info.changes }, []];
          } else {
            const stmt = sqlite.prepare(cleanSql);
            const info = stmt.run(...params);
            return [{ affectedRows: info.changes }, []];
          }
        },
        async commit() {
          sqlite.exec('COMMIT');
        },
        async rollback() {
          try {
            sqlite.exec('ROLLBACK');
          } catch {
            // Already rolled back or no transaction
          }
        },
        release() {
          // No-op for SQLite
        }
      };
    },
    async end() {
      sqlite.close();
    }
  };
}

function transformMysqlToSqlite(sql) {
  let transformed = sql
    .replace(/SELECT\s+DATABASE\(\)\s+AS\s+databaseName/gi, "SELECT 'aicte_casesync' AS databaseName")
    .replace(/\bFOR\s+UPDATE\b/gi, '')
    .replace(/\bNOW\(\)/gi, "datetime('now', 'localtime')")
    .replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now', 'localtime')")
    .replace(/\bCURRENT_DATE\b/gi, "date('now', 'localtime')")
    .replace(/DATE_ADD\(CURRENT_DATE,\s*INTERVAL\s+(\d+)\s+DAY\)/gi, "date('now', 'localtime', '+$1 days')")
    .replace(/DATE_SUB\(CURRENT_DATE,\s*INTERVAL\s+(\d+)\s+DAY\)/gi, "date('now', 'localtime', '-$1 days')")
    .replace(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\d+)\s+DAY\)/gi, "datetime('now', 'localtime', '-$1 days')")
    .replace(/DATE_SUB\(NOW\(\),\s*INTERVAL\s+(\d+)\s+HOUR\)/gi, "datetime('now', 'localtime', '-$1 hours')");

  return transformed;
}

function initializeSqliteTables(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Officer',
      bureau TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS institutions (
      institution_id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_code TEXT NOT NULL UNIQUE,
      institution_name TEXT NOT NULL,
      state TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS cases (
      case_id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_reference TEXT NOT NULL UNIQUE,
      institution_id INTEGER NOT NULL REFERENCES institutions(institution_id),
      bureau TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      priority TEXT NOT NULL DEFAULT 'Medium',
      assigned_officer TEXT,
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS case_history (
      history_id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES cases(case_id),
      previous_status TEXT,
      new_status TEXT,
      action_taken TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS overlap_reviews (
      review_id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL UNIQUE REFERENCES institutions(institution_id),
      review_status TEXT NOT NULL DEFAULT 'Pending Review',
      notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Check if seed data exists
  const userCount = sqlite.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    console.log('[Database] Seeding initial AICTE CaseSync records...');
    
    // Seed Users
    sqlite.exec(`
      INSERT INTO users (full_name, email, password_hash, role, bureau, is_active) VALUES
      ('Dr. Ramesh Sharma (Admin)', 'admin@aicte.gov.in', '$2b$10$ScH4U0KXSd0cb48wnW6kU.C/bp9azTysdNHUY8QTkUYMTEOoMMF8K', 'Admin', 'Central Administration', 1),
      ('Smt. Priya Verma (PGRC)', 'officer.pgrc@aicte.gov.in', '$2b$10$kkrv.8Xx88xqvbByWE7OjuPf/KpuIx25sZScHLUIKfDVhMfpr1sXS', 'Officer', 'PGRC', 1),
      ('Shri Rajesh Nair (Regulation)', 'officer.reg@aicte.gov.in', '$2b$10$kkrv.8Xx88xqvbByWE7OjuPf/KpuIx25sZScHLUIKfDVhMfpr1sXS', 'Officer', 'Regulation Bureau', 1);

      INSERT INTO institutions (institution_id, institution_code, institution_name, state, city, address, contact_email, contact_phone) VALUES
      (1, 'AICTE-INST-1001', 'ABC Engineering College', 'Maharashtra', 'Pune', 'Survey No. 42, Hinjewadi Phase 1, Pune', 'principal@abccollege.edu', '+91 20 2234 5678'),
      (2, 'AICTE-INST-1002', 'Sunrise Institute of Technology', 'Karnataka', 'Bengaluru', 'Plot 88, Electronic City Phase 2, Bengaluru', 'admin@sunrise-tech.ac.in', '+91 80 4123 9876'),
      (3, 'AICTE-INST-1003', 'Delhi Technical Campus', 'Delhi', 'New Delhi', 'Knowledge Park III, Institutional Area, Greater Noida / Delhi NCR', 'director@delhitechnical.org', '+91 11 2890 1234'),
      (4, 'AICTE-INST-1004', 'National Institute of Engineering', 'Tamil Nadu', 'Chennai', '144 Old Mahabalipuram Road, Chennai', 'registrar@nie-chennai.edu.in', '+91 44 2450 7890'),
      (5, 'AICTE-INST-1005', 'Apex Institute of Management', 'Gujarat', 'Ahmedabad', 'SG Highway, Bodakdev, Ahmedabad', 'contact@apexmgt.in', '+91 79 2685 4321'),
      (6, 'AICTE-INST-1006', 'St. Xavier Engineering College', 'Kerala', 'Kochi', 'Kakkanad Infopark Road, Kochi', 'info@stxavierengg.ac.in', '+91 484 290 6543');

      -- ABC Engineering College cases (Example 1: PGRC + Regulation Bureau -> 2 distinct bureaus -> Trigger Cross-Bureau Alert!)
      INSERT INTO cases (case_id, case_reference, institution_id, bureau, category, description, status, priority, assigned_officer, due_date) VALUES
      (101, 'CASE-101', 1, 'PGRC', 'Faculty Salary Grievance', 'Multiple faculty petitions regarding delayed salary disbursement exceeding 4 months and PF non-credit.', 'Pending', 'High', 'Smt. Priya Verma (PGRC)', date('now', 'localtime', '+5 days')),
      (205, 'CASE-205', 1, 'Regulation Bureau', 'Norms Compliance Violation', 'Reported unauthorized intake expansion exceeding sanctioned AICTE capacity by 30 seats in CSE department.', 'Under Process', 'High', 'Shri Rajesh Nair (Regulation)', date('now', 'localtime', '+10 days')),
      (310, 'CASE-310', 1, 'PGRC', 'Student Hostel Safety & Fees', 'Grievance submitted by 2nd year students alleging non-refund of cautionary deposit and inadequate hostel safety.', 'Under Process', 'Medium', 'Smt. Priya Verma (PGRC)', date('now', 'localtime', '+14 days')),

      -- Sunrise Institute of Technology cases (Example 2: Both cases in Regulation Bureau -> 1 distinct bureau -> NO Overlap Alert!)
      (401, 'CASE-401', 2, 'Regulation Bureau', 'Faculty Cadre Ratio Shortfall', 'Annual regulatory review identified shortfall in required Professor to Assistant Professor cadre ratio.', 'Under Process', 'Medium', 'Shri Rajesh Nair (Regulation)', date('now', 'localtime', '+12 days')),
      (402, 'CASE-402', 2, 'Regulation Bureau', 'Laboratory Equipment Compliance', 'Inspection memo regarding incomplete calibration and safety certification in Electrical Engineering labs.', 'Pending', 'Low', 'Shri Rajesh Nair (Regulation)', date('now', 'localtime', '+20 days')),

      -- National Institute of Engineering cases (Spans 3 bureaus: PGRC, Approval Bureau, Finance Cell -> Overlap Alert!)
      (501, 'CASE-501', 4, 'PGRC', 'Capitation Fee Complaint', 'Parent allegation regarding mandatory donation charged under developmental fee head.', 'Pending', 'High', 'Smt. Priya Verma (PGRC)', date('now', 'localtime', '+3 days')),
      (502, 'CASE-502', 4, 'Approval Bureau', 'Building Completion Certificate', 'Extension of Approval application pending verified occupancy certificate for new academic wing.', 'Under Process', 'Medium', 'Dr. Ramesh Sharma (Admin)', date('now', 'localtime', '+15 days')),
      (503, 'CASE-503', 4, 'Finance Cell', 'Grant Utilization Discrepancy', 'MODROBS laboratory modernization grant utilization certificate submitted with missing vouchers.', 'Pending', 'High', 'Dr. Ramesh Sharma (Admin)', date('now', 'localtime', '+7 days')),

      -- Delhi Technical Campus case (1 case only -> NO Overlap Alert!)
      (601, 'CASE-601', 3, 'Approval Bureau', 'New Course Approval Verification', 'Inspection request for starting new Artificial Intelligence and Data Science undergraduate program.', 'Resolved', 'Low', 'Dr. Ramesh Sharma (Admin)', date('now', 'localtime', '-5 days')),

      -- St. Xavier Engineering College cases (2 cases, both in PGRC -> NO Overlap Alert!)
      (701, 'CASE-701', 6, 'PGRC', 'Internal Complaints Committee Inactive', 'Student petition alleging grievance committee and anti-ragging squad not constituted per AICTE Gazette norms.', 'Resolved', 'High', 'Smt. Priya Verma (PGRC)', date('now', 'localtime', '-2 days')),
      (702, 'CASE-702', 6, 'PGRC', 'Exam Schedule Clarification', 'Clarification on supplementary exam timing and credits transfer under NEP framework.', 'Resolved', 'Low', 'Smt. Priya Verma (PGRC)', date('now', 'localtime', '-1 days'));

      INSERT INTO case_history (case_id, previous_status, new_status, action_taken, changed_by, changed_at) VALUES
      (101, NULL, 'Pending', 'Case registered and assigned to PGRC Bureau', 'Dr. Ramesh Sharma (Admin)', datetime('now', 'localtime', '-2 days')),
      (205, 'Pending', 'Under Process', 'Preliminary regulatory notice issued to institution management', 'Shri Rajesh Nair (Regulation)', datetime('now', 'localtime', '-1 days')),
      (310, 'Pending', 'Under Process', 'Notice issued to hostel warden and college committee for inquiry report', 'Smt. Priya Verma (PGRC)', datetime('now', 'localtime', '-18 hours')),
      (401, 'Pending', 'Under Process', 'Compliance document requested from college HR department', 'Shri Rajesh Nair (Regulation)', datetime('now', 'localtime', '-3 days')),
      (402, NULL, 'Pending', 'Inspection report logged for review', 'Dr. Ramesh Sharma (Admin)', datetime('now', 'localtime', '-1 days')),
      (501, NULL, 'Pending', 'Confidential complaint received; preliminary scrutiny initiated', 'Smt. Priya Verma (PGRC)', datetime('now', 'localtime', '-12 hours')),
      (502, 'Pending', 'Under Process', 'Structural safety engineering validation under inspection', 'Dr. Ramesh Sharma (Admin)', datetime('now', 'localtime', '-4 days')),
      (503, NULL, 'Pending', 'Audit query raised on grant expenditure statement', 'Dr. Ramesh Sharma (Admin)', datetime('now', 'localtime', '-6 hours')),
      (601, 'Under Process', 'Resolved', 'Physical verification completed and approval order issued', 'Dr. Ramesh Sharma (Admin)', datetime('now', 'localtime', '-5 days')),
      (701, 'Under Process', 'Resolved', 'Institution reconstituted ICC & uploaded notification on portal', 'Smt. Priya Verma (PGRC)', datetime('now', 'localtime', '-2 days')),
      (702, 'Pending', 'Resolved', 'NEP credit transfer circular communicated to exam branch', 'Smt. Priya Verma (PGRC)', datetime('now', 'localtime', '-1 days'));
    `);
    console.log('[Database] Seeding completed.');
  }
}

// Create MySQL Pool with error handling & fallback
let rawMysqlPool = null;
try {
  rawMysqlPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aicte_casesync',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 2000
  });
} catch (e) {
  console.warn('[Database] MySQL pool creation warning:', e.message);
}

// Proxy pool that transparently switches to SQLite if MySQL fails
const proxyPool = {
  getEngine() {
    return dbEngine;
  },
  async query(sql, params) {
    if (activePool) {
      return activePool.query(sql, params);
    }

    if (rawMysqlPool) {
      try {
        const result = await rawMysqlPool.query(sql, params);
        activePool = rawMysqlPool;
        dbEngine = 'mysql';
        return result;
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
          console.warn(`[Database] MySQL connection refused (${err.code}). Using local persistent database.`);
          activePool = createSqliteCompatibilityPool();
          dbEngine = 'sqlite';
          return activePool.query(sql, params);
        }
        throw err;
      }
    } else {
      activePool = createSqliteCompatibilityPool();
      dbEngine = 'sqlite';
      return activePool.query(sql, params);
    }
  },
  async getConnection() {
    if (activePool) {
      return activePool.getConnection();
    }

    if (rawMysqlPool) {
      try {
        const conn = await rawMysqlPool.getConnection();
        activePool = rawMysqlPool;
        dbEngine = 'mysql';
        return conn;
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
          console.warn(`[Database] MySQL connection refused (${err.code}). Using local persistent database.`);
          activePool = createSqliteCompatibilityPool();
          dbEngine = 'sqlite';
          return activePool.getConnection();
        }
        throw err;
      }
    } else {
      activePool = createSqliteCompatibilityPool();
      dbEngine = 'sqlite';
      return activePool.getConnection();
    }
  },
  async end() {
    if (activePool && activePool.end) {
      await activePool.end();
    }
    if (rawMysqlPool && rawMysqlPool.end) {
      await rawMysqlPool.end();
    }
  }
};

module.exports = proxyPool;
