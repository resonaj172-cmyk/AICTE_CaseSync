const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db');
const app = express();

app.use(cors());
app.use(express.json());

// Basic routes
app.get('/', (req, res) => {
  res.json({ message: 'AICTE CaseSync API is running!' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    application: 'AICTE CaseSync',
    engine: pool.getEngine ? pool.getEngine() : 'database'
  });
});

// Test database connection
app.get('/api/db-test', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DATABASE() AS databaseName');
    res.json({
      connected: true,
      database: rows[0]?.databaseName || 'aicte_casesync',
      engine: pool.getEngine ? pool.getEngine() : 'database'
    });
  } catch (error) {
    console.error('Database test failed:', error.message);
    res.status(500).json({ connected: false, message: 'Database connection failed.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    const [users] = await pool.query(
      `SELECT user_id, full_name, email, password_hash, role, bureau
       FROM users
       WHERE email = ? AND is_active = 1`,
      [email.trim().toLowerCase()]
    );

    if (
      users.length === 0 ||
      !(await bcrypt.compare(password, users[0].password_hash))
    ) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: 'Authentication is not configured.'
      });
    }

    const user = users[0];

    const token = jwt.sign(
      { userId: user.user_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.user_id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        bureau: user.bureau
      }
    });
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(500).json({
      message: 'Unable to log in right now.'
    });
  }
});

// Authentication middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const parts = authHeader ? authHeader.split(' ') : [];
  const token =
    parts.length === 2 && parts[0] === 'Bearer'
      ? parts[1]
      : null;

  if (!token) {
    return res.status(401).json({
      message: 'Please log in to access this resource.'
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      message: 'Authentication is not configured.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [users] = await pool.query(
      `SELECT user_id, full_name, email, role, bureau
       FROM users
       WHERE user_id = ? AND is_active = 1`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: 'Account is inactive or no longer exists.'
      });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({
        message: 'Invalid or expired token.'
      });
    }

    console.error('Authentication failed:', error.message);
    return res.status(500).json({
      message: 'Unable to authenticate request.'
    });
  }
}

// Role authorization middleware
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action.'
      });
    }

    next();
  };
}

// Current user profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    id: req.user.user_id,
    name: req.user.full_name,
    email: req.user.email,
    role: req.user.role,
    bureau: req.user.bureau
  });
});

// Fetch cases: Admin and Officer can view cases
app.get('/api/cases', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        c.case_id,
        c.case_reference,
        c.institution_id,
        i.institution_name,
        i.institution_code,
        i.state,
        c.bureau,
        c.category,
        c.description,
        c.status,
        c.priority,
        c.assigned_officer,
        c.due_date,
        c.created_at,
        c.updated_at
       FROM cases c
       JOIN institutions i ON c.institution_id = i.institution_id
       ORDER BY c.case_id DESC`
    );

    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch cases:', error.message);
    res.status(500).json({
      message: 'Unable to fetch cases.'
    });
  }
});

// Fetch single case details
app.get('/api/cases/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id) || Number(id) < 1) {
      return res.status(400).json({ message: 'Invalid case ID.' });
    }

    const [rows] = await pool.query(
      `SELECT
        c.case_id,
        c.case_reference,
        c.institution_id,
        i.institution_name,
        i.institution_code,
        i.state,
        i.city,
        i.contact_email,
        i.contact_phone,
        c.bureau,
        c.category,
        c.description,
        c.status,
        c.priority,
        c.assigned_officer,
        c.due_date,
        c.created_at,
        c.updated_at
       FROM cases c
       JOIN institutions i ON c.institution_id = i.institution_id
       WHERE c.case_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Case not found.' });
    }

    const caseItem = rows[0];

    // Fetch case history
    const [history] = await pool.query(
      `SELECT
        history_id,
        case_id,
        previous_status,
        new_status,
        action_taken,
        changed_by,
        changed_at
       FROM case_history
       WHERE case_id = ?
       ORDER BY history_id DESC`,
      [id]
    );

    // Check sibling cases for same institution to show potential overlap
    const [otherCases] = await pool.query(
      `SELECT case_id, case_reference, bureau, status, priority
       FROM cases
       WHERE institution_id = ? AND case_id != ?`,
      [caseItem.institution_id, id]
    );

    res.json({
      ...caseItem,
      history,
      related_institution_cases: otherCases
    });
  } catch (error) {
    console.error('Failed to fetch case details:', error.message);
    res.status(500).json({ message: 'Unable to fetch case details.' });
  }
});

// Fetch institutions: Admin and Officer can view institutions
app.get('/api/institutions', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        i.institution_id,
        i.institution_code,
        i.institution_name,
        i.state,
        i.city,
        i.address,
        i.contact_email,
        i.contact_phone,
        i.created_at,
        COUNT(c.case_id) AS total_cases,
        SUM(CASE WHEN c.status IN ('Pending', 'Under Process') THEN 1 ELSE 0 END) AS active_cases
       FROM institutions i
       LEFT JOIN cases c ON i.institution_id = c.institution_id
       GROUP BY i.institution_id, i.institution_code, i.institution_name, i.state, i.city, i.address, i.contact_email, i.contact_phone, i.created_at
       ORDER BY i.institution_name`
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching institutions:', error.message);
    res.status(500).json({
      message: 'Unable to fetch institutions.'
    });
  }
});

// Fetch single institution with its cases
app.get('/api/institutions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id) || Number(id) < 1) {
      return res.status(400).json({ message: 'Invalid institution ID.' });
    }

    const [instRows] = await pool.query(
      `SELECT institution_id, institution_code, institution_name, state, city, address, contact_email, contact_phone, created_at
       FROM institutions
       WHERE institution_id = ?`,
      [id]
    );

    if (instRows.length === 0) {
      return res.status(404).json({ message: 'Institution not found.' });
    }

    const [caseRows] = await pool.query(
      `SELECT case_id, case_reference, bureau, category, description, status, priority, assigned_officer, due_date, created_at
       FROM cases
       WHERE institution_id = ?
       ORDER BY case_id DESC`,
      [id]
    );

    const bureaus = [...new Set(caseRows.map(c => c.bureau?.trim()).filter(Boolean))];

    res.json({
      ...instRows[0],
      cases: caseRows,
      distinct_bureaus: bureaus,
      has_cross_bureau_overlap: bureaus.length > 1
    });
  } catch (error) {
    console.error('Error fetching institution details:', error.message);
    res.status(500).json({ message: 'Unable to fetch institution details.' });
  }
});

// Create new institution: Admin only
app.post(
  '/api/institutions',
  authenticateToken,
  allowRoles('Admin'),
  async (req, res) => {
    try {
      const { institution_code, institution_name, state, city, address, contact_email, contact_phone } = req.body;

      if (!institution_name || !institution_name.trim()) {
        return res.status(400).json({ message: 'Institution name is required.' });
      }

      const code = institution_code && institution_code.trim()
        ? institution_code.trim().toUpperCase()
        : `AICTE-INST-${Date.now().toString().slice(-4)}`;

      const [result] = await pool.query(
        `INSERT INTO institutions (institution_code, institution_name, state, city, address, contact_email, contact_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          institution_name.trim(),
          state?.trim() || 'Unspecified',
          city?.trim() || 'Unspecified',
          address?.trim() || null,
          contact_email?.trim() || null,
          contact_phone?.trim() || null
        ]
      );

      res.status(201).json({
        message: 'Institution created successfully!',
        institution_id: result.insertId,
        institution_code: code,
        institution_name: institution_name.trim()
      });
    } catch (error) {
      console.error('Error creating institution:', error.message);
      res.status(500).json({ message: 'Unable to create institution. Code may already exist.' });
    }
  }
);

// Create a case: Admin only
app.post(
  '/api/cases',
  authenticateToken,
  allowRoles('Admin'),
  async (req, res) => {
    try {
      const {
        institution_id,
        bureau,
        category,
        description,
        priority,
        assigned_officer,
        due_date
      } = req.body;

      if (
        !institution_id ||
        !bureau ||
        !bureau.trim() ||
        !category ||
        !category.trim() ||
        !description ||
        !description.trim() ||
        !priority
      ) {
        return res.status(400).json({
          message: 'Please fill in all required fields (Institution, Bureau, Category, Priority, and Description).'
        });
      }

      const [institutions] = await pool.query(
        'SELECT institution_id, institution_name FROM institutions WHERE institution_id = ?',
        [institution_id]
      );

      if (institutions.length === 0) {
        return res.status(400).json({
          message: 'Selected institution does not exist.'
        });
      }

      const allowedPriorities = ['Low', 'Medium', 'High'];
      if (!allowedPriorities.includes(priority)) {
        return res.status(400).json({
          message: 'Invalid case priority. Allowed: Low, Medium, High.'
        });
      }

      const case_reference = `CASE-${Date.now().toString().slice(-6)}`;

      let connection;
      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
          `INSERT INTO cases
          (
            case_reference,
            institution_id,
            bureau,
            category,
            description,
            priority,
            assigned_officer,
            due_date
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            case_reference,
            institution_id,
            bureau.trim(),
            category.trim(),
            description.trim(),
            priority,
            assigned_officer ? assigned_officer.trim() : null,
            due_date || null
          ]
        );

        const newCaseId = result.insertId;

        // Record initial creation in case_history audit trail
        await connection.query(
          `INSERT INTO case_history
          (
            case_id,
            previous_status,
            new_status,
            action_taken,
            changed_by
          )
          VALUES (?, NULL, 'Pending', ?, ?)`,
          [
            newCaseId,
            `Case created and registered under ${bureau.trim()} (Priority: ${priority})`,
            req.user.full_name
          ]
        );

        await connection.commit();

        res.status(201).json({
          message: 'Case created successfully!',
          case_id: newCaseId,
          case_reference
        });
      } catch (innerError) {
        if (connection) await connection.rollback();
        throw innerError;
      } finally {
        if (connection) connection.release();
      }
    } catch (error) {
      console.error('Error creating case:', error.message);
      res.status(500).json({
        message: 'Unable to create case. Please check the submitted details.'
      });
    }
  }
);

// Update case status and record history
app.patch(
  '/api/cases/:id/status',
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    const allowedStatuses = [
      'Pending',
      'Under Process',
      'Resolved',
      'Rejected'
    ];

    if (!/^\d+$/.test(id) || Number(id) < 1) {
      return res.status(400).json({
        message: 'Invalid case ID.'
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid case status. Allowed values: Pending, Under Process, Resolved, Rejected.'
      });
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT status, assigned_officer, case_reference
         FROM cases
         WHERE case_id = ?
         FOR UPDATE`,
        [id]
      );

      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          message: 'Case not found.'
        });
      }

      if (
        req.user.role !== 'Admin' &&
        rows[0].assigned_officer &&
        rows[0].assigned_officer !== req.user.full_name
      ) {
        await connection.rollback();
        return res.status(403).json({
          message: 'You can only update cases assigned to you.'
        });
      }

      const previousStatus = rows[0].status;

      if (previousStatus === status) {
        await connection.rollback();
        return res.json({
          message: 'The case already has this status.',
          status
        });
      }

      await connection.query(
        'UPDATE cases SET status = ? WHERE case_id = ?',
        [status, id]
      );

      const actionText = notes
        ? `Status changed from ${previousStatus} to ${status}: ${notes}`
        : `Status changed from ${previousStatus} to ${status}`;

      await connection.query(
        `INSERT INTO case_history
        (
          case_id,
          previous_status,
          new_status,
          action_taken,
          changed_by
        )
        VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          previousStatus,
          status,
          actionText,
          req.user.full_name
        ]
      );

      await connection.commit();

      res.json({
        message: 'Case status updated successfully!',
        case_id: Number(id),
        case_reference: rows[0].case_reference,
        previous_status: previousStatus,
        new_status: status
      });
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }

      console.error('Error updating case status:', error.message);
      res.status(500).json({
        message: 'Unable to update case status.'
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

// General case update (reassign bureau, change priority, reassign officer, update due date)
// Admin only for bureau reassignment and priority changes
app.patch(
  '/api/cases/:id',
  authenticateToken,
  async (req, res) => {
    const { id } = req.params;
    const { bureau, priority, assigned_officer, due_date, status, notes } = req.body;

    if (!/^\d+$/.test(id) || Number(id) < 1) {
      return res.status(400).json({ message: 'Invalid case ID.' });
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT case_id, case_reference, bureau, priority, assigned_officer, due_date, status
         FROM cases
         WHERE case_id = ?
         FOR UPDATE`,
        [id]
      );

      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Case not found.' });
      }

      const currentCase = rows[0];

      // Non-admins can only modify cases assigned to them and cannot reassign bureaus
      if (req.user.role !== 'Admin') {
        if (bureau && bureau !== currentCase.bureau) {
          await connection.rollback();
          return res.status(403).json({ message: 'Only Administrators can reassign case bureaus/cells.' });
        }
        if (priority && priority !== currentCase.priority) {
          await connection.rollback();
          return res.status(403).json({ message: 'Only Administrators can change case priority.' });
        }
        if (currentCase.assigned_officer && currentCase.assigned_officer !== req.user.full_name) {
          await connection.rollback();
          return res.status(403).json({ message: 'You can only update cases assigned to you.' });
        }
      }

      const updates = [];
      const params = [];
      const historyActions = [];

      if (bureau && bureau.trim() && bureau.trim() !== currentCase.bureau) {
        updates.push('bureau = ?');
        params.push(bureau.trim());
        historyActions.push(`Bureau reassigned from "${currentCase.bureau}" to "${bureau.trim()}"`);
      }

      if (priority && ['Low', 'Medium', 'High'].includes(priority) && priority !== currentCase.priority) {
        updates.push('priority = ?');
        params.push(priority);
        historyActions.push(`Priority changed from "${currentCase.priority}" to "${priority}"`);
      }

      if (assigned_officer !== undefined && assigned_officer !== currentCase.assigned_officer) {
        updates.push('assigned_officer = ?');
        params.push(assigned_officer ? assigned_officer.trim() : null);
        historyActions.push(`Assigned officer changed from "${currentCase.assigned_officer || 'None'}" to "${assigned_officer || 'Unassigned'}"`);
      }

      if (due_date !== undefined && due_date !== currentCase.due_date) {
        updates.push('due_date = ?');
        params.push(due_date || null);
        historyActions.push(`Due date updated to ${due_date || 'None'}`);
      }

      let newStatus = currentCase.status;
      if (status && ['Pending', 'Under Process', 'Resolved', 'Rejected'].includes(status) && status !== currentCase.status) {
        updates.push('status = ?');
        params.push(status);
        newStatus = status;
        historyActions.push(`Status changed from "${currentCase.status}" to "${status}"`);
      }

      if (updates.length === 0) {
        await connection.rollback();
        return res.json({ message: 'No changes detected.', case: currentCase });
      }

      params.push(id);
      await connection.query(
        `UPDATE cases SET ${updates.join(', ')} WHERE case_id = ?`,
        params
      );

      // Record in history
      const actionSummary = historyActions.join('; ') + (notes ? ` (${notes})` : '');
      await connection.query(
        `INSERT INTO case_history
        (
          case_id,
          previous_status,
          new_status,
          action_taken,
          changed_by
        )
        VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          currentCase.status,
          newStatus,
          actionSummary,
          req.user.full_name
        ]
      );

      await connection.commit();

      res.json({
        message: 'Case details updated successfully!',
        case_id: Number(id),
        case_reference: currentCase.case_reference,
        actions: historyActions
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error updating case details:', error.message);
      res.status(500).json({ message: 'Unable to update case details.' });
    } finally {
      if (connection) connection.release();
    }
  }
);

// Fetch workflow history: Admin and Officer can view all case history
app.get(
  '/api/cases/:id/history',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!/^\d+$/.test(id) || Number(id) < 1) {
        return res.status(400).json({
          message: 'Invalid case ID.'
        });
      }

      const [cases] = await pool.query(
        'SELECT case_id FROM cases WHERE case_id = ?',
        [id]
      );

      if (cases.length === 0) {
        return res.status(404).json({
          message: 'Case not found.'
        });
      }

      const [rows] = await pool.query(
        `SELECT
          history_id,
          case_id,
          previous_status,
          new_status,
          action_taken,
          changed_by,
          changed_at
         FROM case_history
         WHERE case_id = ?
         ORDER BY history_id DESC`,
        [id]
      );

      res.json(rows);
    } catch (error) {
      console.error('Error fetching case history:', error.message);
      res.status(500).json({
        message: 'Unable to fetch case history.'
      });
    }
  }
);

// Global workflow audit history
app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const caseId = req.query.caseId;

    let query = `
      SELECT
        h.history_id,
        h.case_id,
        c.case_reference,
        i.institution_name,
        h.previous_status,
        h.new_status,
        h.action_taken,
        h.changed_by,
        h.changed_at
      FROM case_history h
      JOIN cases c ON h.case_id = c.case_id
      JOIN institutions i ON c.institution_id = i.institution_id
    `;
    const params = [];

    if (caseId && /^\d+$/.test(caseId)) {
      query += ' WHERE h.case_id = ?';
      params.push(caseId);
    }

    query += ' ORDER BY h.history_id DESC LIMIT 200';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching global history:', error.message);
    res.status(500).json({ message: 'Unable to fetch workflow history.' });
  }
});

// ==============================================================================
// CROSS-BUREAU OVERLAP ALERTS API
// Flags institutions ONLY when they have cases spanning > 1 distinct AICTE bureau
// ==============================================================================
app.get('/api/overlap-alerts', authenticateToken, async (req, res) => {
  try {
    const [institutions] = await pool.query(
      `SELECT institution_id, institution_code, institution_name, state, city
       FROM institutions
       ORDER BY institution_name`
    );

    const [cases] = await pool.query(
      `SELECT
        c.case_id,
        c.case_reference,
        c.institution_id,
        i.institution_name,
        c.bureau,
        c.category,
        c.description,
        c.status,
        c.priority,
        c.assigned_officer,
        c.due_date,
        c.created_at
       FROM cases c
       JOIN institutions i ON c.institution_id = i.institution_id
       ORDER BY c.case_id DESC`
    );

    const [reviews] = await pool.query(
      `SELECT institution_id, review_status, notes, reviewed_by, reviewed_at
       FROM overlap_reviews`
    );

    const reviewMap = new Map();
    for (const r of reviews) {
      reviewMap.set(Number(r.institution_id), r);
    }

    // Group cases by institution
    const institutionCasesMap = new Map();
    for (const inst of institutions) {
      institutionCasesMap.set(Number(inst.institution_id), {
        institution_id: inst.institution_id,
        institution_code: inst.institution_code,
        institution_name: inst.institution_name,
        state: inst.state,
        city: inst.city,
        cases: []
      });
    }

    for (const c of cases) {
      const instId = Number(c.institution_id);
      if (institutionCasesMap.has(instId)) {
        institutionCasesMap.get(instId).cases.push(c);
      }
    }

    const alerts = [];
    let totalRelatedCases = 0;
    const globalDistinctBureaus = new Set();

    for (const inst of institutionCasesMap.values()) {
      // Ignore empty, null, or invalid bureau names
      const validBureausMap = new Map(); // normalized -> display
      for (const item of inst.cases) {
        if (item.bureau && typeof item.bureau === 'string' && item.bureau.trim().length > 0) {
          const trimmed = item.bureau.trim();
          const norm = trimmed.toLowerCase();
          if (!validBureausMap.has(norm)) {
            validBureausMap.set(norm, trimmed);
          }
        }
      }

      const distinctBureaus = Array.from(validBureausMap.values());
      const bureauCount = distinctBureaus.length;

      // Flag ONLY when cases span MORE THAN ONE distinct bureau/cell
      // Multiple cases within only one bureau must NOT trigger a cross-bureau alert
      if (bureauCount > 1) {
        totalRelatedCases += inst.cases.length;
        for (const b of distinctBureaus) {
          globalDistinctBureaus.add(b);
        }

        const rev = reviewMap.get(Number(inst.institution_id));

        // Group cases by bureau for structured display
        const bureauBreakdown = distinctBureaus.map(bureauName => {
          const matchingCases = inst.cases.filter(
            c => c.bureau && c.bureau.trim().toLowerCase() === bureauName.toLowerCase()
          );
          return {
            bureau: bureauName,
            count: matchingCases.length,
            cases: matchingCases
          };
        });

        alerts.push({
          institution_id: inst.institution_id,
          institution_code: inst.institution_code,
          institution_name: inst.institution_name,
          state: inst.state,
          city: inst.city,
          case_count: inst.cases.length,
          bureau_count: bureauCount,
          distinct_bureaus: distinctBureaus,
          bureau_breakdown: bureauBreakdown,
          explanation: `Flagged: Institution has ${inst.cases.length} complaint cases spanning ${bureauCount} distinct AICTE bureaus/cells (${distinctBureaus.join(', ')}). Multiple active bureaus indicate potential cross-bureau coordination overlap.`,
          cases: inst.cases,
          review_status: rev ? rev.review_status : 'Pending Review',
          review_notes: rev ? rev.notes : '',
          reviewed_by: rev ? rev.reviewed_by : null,
          reviewed_at: rev ? rev.reviewed_at : null
        });
      }
    }

    // Sort alerts: Pending Review first, then by case count descending
    alerts.sort((a, b) => {
      if (a.review_status === 'Pending Review' && b.review_status !== 'Pending Review') return -1;
      if (a.review_status !== 'Pending Review' && b.review_status === 'Pending Review') return 1;
      return b.case_count - a.case_count;
    });

    res.json({
      summary: {
        total_institutions_checked: institutions.length,
        institutions_flagged: alerts.length,
        related_cases_count: totalRelatedCases,
        distinct_bureaus_count: globalDistinctBureaus.size,
        distinct_bureaus_involved: Array.from(globalDistinctBureaus).sort()
      },
      alerts
    });
  } catch (error) {
    console.error('Failed to calculate overlap alerts:', error.message);
    res.status(500).json({ message: 'Unable to calculate overlap alerts.' });
  }
});

// Review Cross-Bureau Overlap Alert
app.post('/api/overlap-alerts/:institutionId/review', authenticateToken, async (req, res) => {
  const { institutionId } = req.params;
  const { review_status, notes } = req.body;

  if (!/^\d+$/.test(institutionId) || Number(institutionId) < 1) {
    return res.status(400).json({ message: 'Invalid institution ID.' });
  }

  const validStatuses = ['Pending Review', 'Reviewed'];
  const status = validStatuses.includes(review_status) ? review_status : 'Reviewed';

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [instRows] = await connection.query(
      'SELECT institution_id, institution_name FROM institutions WHERE institution_id = ?',
      [institutionId]
    );

    if (instRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Institution not found.' });
    }

    const institution = instRows[0];

    const [existing] = await connection.query(
      'SELECT review_id, review_status FROM overlap_reviews WHERE institution_id = ?',
      [institutionId]
    );

    if (existing.length > 0) {
      await connection.query(
        `UPDATE overlap_reviews
         SET review_status = ?, notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE institution_id = ?`,
        [status, notes ? notes.trim() : null, req.user.full_name, institutionId]
      );
    } else {
      await connection.query(
        `INSERT INTO overlap_reviews (institution_id, review_status, notes, reviewed_by, reviewed_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [institutionId, status, notes ? notes.trim() : null, req.user.full_name]
      );
    }

    // Record review action in case history for all associated cases
    const [instCases] = await connection.query(
      'SELECT case_id, case_reference FROM cases WHERE institution_id = ?',
      [institutionId]
    );

    const actionText = status === 'Reviewed'
      ? `Cross-Bureau Overlap Alert marked as Reviewed by ${req.user.full_name}${notes ? ': ' + notes : ''}`
      : `Cross-Bureau Overlap Alert reopened by ${req.user.full_name}`;

    for (const c of instCases) {
      await connection.query(
        `INSERT INTO case_history (case_id, previous_status, new_status, action_taken, changed_by)
         VALUES (?, NULL, NULL, ?, ?)`,
        [c.case_id, actionText, req.user.full_name]
      );
    }

    await connection.commit();

    res.json({
      message: `Institution overlap alert updated to "${status}".`,
      institution_id: Number(institutionId),
      institution_name: institution.institution_name,
      review_status: status,
      reviewed_by: req.user.full_name,
      notes: notes || ''
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error recording overlap review:', error.message);
    res.status(500).json({ message: 'Unable to update review status.' });
  } finally {
    if (connection) connection.release();
  }
});

// Comprehensive Reports and Analytics
app.get('/api/reports/summary', authenticateToken, async (req, res) => {
  try {
    const [cases] = await pool.query(
      `SELECT
        c.case_id,
        c.case_reference,
        c.institution_id,
        i.institution_name,
        c.bureau,
        c.category,
        c.status,
        c.priority,
        c.due_date,
        c.created_at
       FROM cases c
       JOIN institutions i ON c.institution_id = i.institution_id`
    );

    const total = cases.length;
    const pending = cases.filter(c => c.status === 'Pending').length;
    const underProcess = cases.filter(c => c.status === 'Under Process').length;
    const resolved = cases.filter(c => c.status === 'Resolved').length;
    const rejected = cases.filter(c => c.status === 'Rejected').length;

    const highPriority = cases.filter(c => c.priority === 'High').length;
    const mediumPriority = cases.filter(c => c.priority === 'Medium').length;
    const lowPriority = cases.filter(c => c.priority === 'Low').length;

    const now = new Date();
    const overdue = cases.filter(c =>
      !['Resolved', 'Rejected'].includes(c.status) &&
      c.due_date &&
      new Date(c.due_date) < now
    ).length;

    const resolutionRate = total === 0 ? 0 : Math.round((resolved / total) * 100);

    // Group by Bureau
    const bureauMap = new Map();
    for (const c of cases) {
      const b = c.bureau || 'Unassigned';
      if (!bureauMap.has(b)) {
        bureauMap.set(b, { bureau: b, total: 0, pending: 0, underProcess: 0, resolved: 0, rejected: 0 });
      }
      const item = bureauMap.get(b);
      item.total++;
      if (c.status === 'Pending') item.pending++;
      else if (c.status === 'Under Process') item.underProcess++;
      else if (c.status === 'Resolved') item.resolved++;
      else if (c.status === 'Rejected') item.rejected++;
    }

    const byBureau = Array.from(bureauMap.values()).sort((a, b) => b.total - a.total);

    // Group by Status
    const byStatus = [
      { status: 'Pending', count: pending, percentage: total ? Math.round((pending / total) * 100) : 0 },
      { status: 'Under Process', count: underProcess, percentage: total ? Math.round((underProcess / total) * 100) : 0 },
      { status: 'Resolved', count: resolved, percentage: total ? Math.round((resolved / total) * 100) : 0 },
      { status: 'Rejected', count: rejected, percentage: total ? Math.round((rejected / total) * 100) : 0 }
    ];

    // Group by Priority
    const byPriority = [
      { priority: 'High', count: highPriority, percentage: total ? Math.round((highPriority / total) * 100) : 0 },
      { priority: 'Medium', count: mediumPriority, percentage: total ? Math.round((mediumPriority / total) * 100) : 0 },
      { priority: 'Low', count: lowPriority, percentage: total ? Math.round((lowPriority / total) * 100) : 0 }
    ];

    // Group by Institution
    const instMap = new Map();
    for (const c of cases) {
      if (!instMap.has(c.institution_id)) {
        instMap.set(c.institution_id, {
          institution_id: c.institution_id,
          institution_name: c.institution_name,
          total: 0,
          open: 0
        });
      }
      const item = instMap.get(c.institution_id);
      item.total++;
      if (['Pending', 'Under Process'].includes(c.status)) {
        item.open++;
      }
    }
    const byInstitution = Array.from(instMap.values()).sort((a, b) => b.total - a.total);

    // Recent activity
    const [recentActivity] = await pool.query(
      `SELECT
        h.history_id,
        h.case_id,
        c.case_reference,
        i.institution_name,
        h.previous_status,
        h.new_status,
        h.action_taken,
        h.changed_by,
        h.changed_at
       FROM case_history h
       JOIN cases c ON h.case_id = c.case_id
       JOIN institutions i ON c.institution_id = i.institution_id
       ORDER BY h.history_id DESC
       LIMIT 10`
    );

    res.json({
      totals: {
        total_cases: total,
        pending_cases: pending,
        under_process_cases: underProcess,
        resolved_cases: resolved,
        rejected_cases: rejected,
        high_priority_cases: highPriority,
        medium_priority_cases: mediumPriority,
        low_priority_cases: lowPriority,
        overdue_cases: overdue,
        resolution_rate: resolutionRate
      },
      by_bureau: byBureau,
      by_status: byStatus,
      by_priority: byPriority,
      by_institution: byInstitution,
      recent_activity: recentActivity
    });
  } catch (error) {
    console.error('Error fetching reports summary:', error.message);
    res.status(500).json({ message: 'Unable to fetch reports summary.' });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`AICTE CaseSync backend running on port ${PORT}`);
});
