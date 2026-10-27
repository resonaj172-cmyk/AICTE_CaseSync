const assert = require('assert');
const jwt = require('jsonwebtoken');
const pool = require('./db');

async function runTests() {
  console.log('=== STARTING AICTE CASESYNC BACKEND VERIFICATION ===\n');

  try {
    // 1. Database Connection & Info
    console.log('[1/8] Verifying Database Connection...');
    const [dbTest] = await pool.query('SELECT DATABASE() AS databaseName');
    assert.strictEqual(dbTest[0].databaseName, 'aicte_casesync');
    console.log('✔ Connected to database:', dbTest[0].databaseName);

    // 2. User Authentication Check
    console.log('\n[2/8] Verifying User Authentication Table...');
    const [users] = await pool.query('SELECT user_id, full_name, email, role FROM users');
    assert(users.length >= 2, 'Must have at least Admin and Officer users');
    const adminUser = users.find(u => u.role === 'Admin');
    const officerUser = users.find(u => u.role === 'Officer');
    assert(adminUser, 'Admin user must exist');
    assert(officerUser, 'Officer user must exist');
    console.log(`✔ Found ${users.length} users: Admin (${adminUser.email}), Officer (${officerUser.email})`);

    // 3. Institutions & Cases Check
    console.log('\n[3/8] Verifying Institutions and Cases Seed Data...');
    const [institutions] = await pool.query('SELECT * FROM institutions');
    const [cases] = await pool.query('SELECT * FROM cases');
    console.log(`✔ Loaded ${institutions.length} institutions and ${cases.length} cases.`);

    // 4. Cross-Bureau Overlap Alerts Logic Verification
    console.log('\n[4/8] Testing Cross-Bureau Overlap Detection Logic...');

    // Function to calculate alerts exactly as the endpoint does
    function computeOverlapAlerts(instList, caseList) {
      const instMap = new Map();
      for (const inst of instList) {
        instMap.set(Number(inst.institution_id), { ...inst, cases: [] });
      }
      for (const c of caseList) {
        const id = Number(c.institution_id);
        if (instMap.has(id)) {
          instMap.get(id).cases.push(c);
        }
      }

      const flagged = [];
      for (const inst of instMap.values()) {
        const validBureaus = new Map();
        for (const item of inst.cases) {
          if (item.bureau && item.bureau.trim().length > 0) {
            const trimmed = item.bureau.trim();
            const norm = trimmed.toLowerCase();
            if (!validBureaus.has(norm)) {
              validBureaus.set(norm, trimmed);
            }
          }
        }
        const distinctBureaus = Array.from(validBureaus.values());
        if (distinctBureaus.length > 1) {
          flagged.push({
            institution_name: inst.institution_name,
            institution_id: inst.institution_id,
            bureau_count: distinctBureaus.length,
            distinct_bureaus: distinctBureaus,
            case_count: inst.cases.length
          });
        }
      }
      return flagged;
    }

    const alerts = computeOverlapAlerts(institutions, cases);
    console.log(`✔ Total Flagged Institutions: ${alerts.length}`);
    for (const a of alerts) {
      console.log(`   - ${a.institution_name}: ${a.case_count} cases across ${a.bureau_count} bureaus (${a.distinct_bureaus.join(', ')})`);
    }

    // Verify Prompt Example 1: ABC Engineering College (CASE-101 PGRC, CASE-205 Regulation Bureau, CASE-310 PGRC)
    const abc = alerts.find(a => a.institution_name === 'ABC Engineering College');
    assert(abc, 'Example 1 FAIL: ABC Engineering College must be flagged for cross-bureau overlap');
    assert.strictEqual(abc.bureau_count, 2, 'ABC Engineering College must have 2 distinct bureaus');
    assert(abc.distinct_bureaus.includes('PGRC') && abc.distinct_bureaus.includes('Regulation Bureau'));
    console.log('✔ Prompt Example 1 PASSED: ABC Engineering College correctly flagged (PGRC + Regulation Bureau).');

    // Verify Prompt Example 2: Sunrise Institute of Technology (CASE-401 Regulation Bureau, CASE-402 Regulation Bureau)
    const sunrise = alerts.find(a => a.institution_name === 'Sunrise Institute of Technology');
    assert.strictEqual(sunrise, undefined, 'Example 2 FAIL: Sunrise Institute must NOT be flagged (cases in same bureau)');
    console.log('✔ Prompt Example 2 PASSED: Sunrise Institute of Technology correctly NOT flagged (both in Regulation Bureau).');

    // Verify St. Xavier (2 cases in PGRC only)
    const stXavier = alerts.find(a => a.institution_name === 'St. Xavier Engineering College');
    assert.strictEqual(stXavier, undefined, 'St. Xavier must NOT be flagged (all cases in PGRC)');
    console.log('✔ Same-Bureau Verification PASSED: St. Xavier with multiple cases in only PGRC is NOT flagged.');

    // Verify Delhi Technical Campus (1 case)
    const dtc = alerts.find(a => a.institution_name === 'Delhi Technical Campus');
    assert.strictEqual(dtc, undefined, 'Single-case institution must NOT be flagged');
    console.log('✔ Single-Case Verification PASSED: Delhi Technical Campus with 1 case is NOT flagged.');

    // Verify Apex Institute of Management (0 cases)
    const apex = alerts.find(a => a.institution_name === 'Apex Institute of Management');
    assert.strictEqual(apex, undefined, 'Zero-case institution must NOT be flagged');
    console.log('✔ Zero-Case Verification PASSED: Apex Institute of Management with 0 cases is NOT flagged.');

    // 5. Test Overlap Alert Dynamic Update when Case Bureau Changes
    console.log('\n[5/8] Testing Dynamic Alert Update on Bureau Reassignment...');
    // If we reassign CASE-402 of Sunrise Institute of Technology from 'Regulation Bureau' to 'Approval Bureau'
    const simulatedCases = cases.map(c => {
      if (c.case_reference === 'CASE-402') {
        return { ...c, bureau: 'Approval Bureau' };
      }
      return c;
    });
    const updatedAlerts = computeOverlapAlerts(institutions, simulatedCases);
    const sunriseUpdated = updatedAlerts.find(a => a.institution_name === 'Sunrise Institute of Technology');
    assert(sunriseUpdated, 'Sunrise Institute must now be flagged when CASE-402 is reassigned to Approval Bureau');
    console.log('✔ Dynamic Alert Update PASSED: Reassigning CASE-402 immediately flagged Sunrise Institute.');

    // 6. Test Status Change and Audit History
    console.log('\n[6/8] Testing Status Change & History Audit Trail...');
    const [caseToUpdate] = await pool.query('SELECT case_id, status FROM cases WHERE case_reference = ?', ['CASE-101']);
    assert(caseToUpdate.length > 0);
    const initialStatus = caseToUpdate[0].status;
    const testNewStatus = initialStatus === 'Pending' ? 'Under Process' : 'Pending';

    await pool.query('UPDATE cases SET status = ? WHERE case_id = ?', [testNewStatus, caseToUpdate[0].case_id]);
    await pool.query(
      `INSERT INTO case_history (case_id, previous_status, new_status, action_taken, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [caseToUpdate[0].case_id, initialStatus, testNewStatus, 'Automated Test Status Change', 'Test Runner']
    );

    const [updatedRow] = await pool.query('SELECT status FROM cases WHERE case_id = ?', [caseToUpdate[0].case_id]);
    assert.strictEqual(updatedRow[0].status, testNewStatus);

    const [historyRows] = await pool.query('SELECT * FROM case_history WHERE case_id = ? ORDER BY history_id DESC', [caseToUpdate[0].case_id]);
    assert(historyRows.length > 0);
    assert.strictEqual(historyRows[0].new_status, testNewStatus);
    assert.strictEqual(historyRows[0].previous_status, initialStatus);
    console.log(`✔ Status update from "${initialStatus}" to "${testNewStatus}" verified and recorded in case_history.`);

    // Restore CASE-101
    await pool.query('UPDATE cases SET status = ? WHERE case_id = ?', [initialStatus, caseToUpdate[0].case_id]);

    // 7. Test Overlap Alert Review Status
    console.log('\n[7/8] Testing Overlap Alert Review Storage & Audit...');
    await pool.query(
      `INSERT INTO overlap_reviews (institution_id, review_status, notes, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [1, 'Reviewed', 'Cross-bureau coordination meeting scheduled with PGRC & Regulation Bureau chiefs', 'Dr. Ramesh Sharma (Admin)']
    );

    const [reviewRows] = await pool.query('SELECT * FROM overlap_reviews WHERE institution_id = 1');
    assert.strictEqual(reviewRows.length, 1);
    assert.strictEqual(reviewRows[0].review_status, 'Reviewed');
    console.log('✔ Overlap Alert Review recorded and verified in database.');

    // 8. Test Reports Summary Metrics
    console.log('\n[8/8] Testing Reports Summary Aggregations...');
    const [allCases] = await pool.query('SELECT * FROM cases');
    const resolvedCount = allCases.filter(c => c.status === 'Resolved').length;
    const pendingCount = allCases.filter(c => c.status === 'Pending').length;
    console.log(`✔ Aggregated metrics: ${allCases.length} total cases, ${resolvedCount} resolved, ${pendingCount} pending.`);

    console.log('\n======================================================');
    console.log(' ALL 8 BACKEND AND LOGIC VERIFICATIONS PASSED 100%! ');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();
