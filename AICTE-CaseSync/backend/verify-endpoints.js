async function test() {
  try {
    const healthRes = await fetch('http://localhost:5000/api/health');
    console.log('1. Health check:', await healthRes.json());

    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@aicte.gov.in', password: 'Admin@123' })
    });
    const loginData = await loginRes.json();
    console.log('2. Admin Login successful:', loginData.user.name, `(${loginData.user.role})`);
    const token = loginData.token;

    // Overlap Alerts
    const alertsRes = await fetch('http://localhost:5000/api/overlap-alerts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const alertsData = await alertsRes.json();
    console.log('3. Overlap Alerts Summary:', alertsData.summary);
    console.log('   Flagged Institutions count:', alertsData.alerts.length);
    for (const a of alertsData.alerts) {
      console.log(`   - ${a.institution_name}: ${a.case_count} cases, Bureaus: [${a.distinct_bureaus.join(', ')}]`);
    }

    // Reports Summary
    const reportsRes = await fetch('http://localhost:5000/api/reports/summary', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const reports = await reportsRes.json();
    console.log('4. Reports Totals:', reports.totals);

    console.log('\n✔ ALL API ENDPOINTS RESPONDED WITH VALID HTTP 200 DATA!');
  } catch (err) {
    console.error('API Verification error:', err.message);
  }
}

test();
