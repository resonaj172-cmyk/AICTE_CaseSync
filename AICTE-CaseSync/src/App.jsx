import { useEffect, useState, useMemo } from 'react';
import './App.css';

const API = 'http://localhost:5000/api';

function App() {
  // Authentication State
  const [token, setToken] = useState(() => localStorage.getItem('casesync_token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('casesync_user') || 'null');
    } catch {
      return null;
    }
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Navigation State
  const [activePage, setActivePage] = useState('Dashboard');

  // Core Data States
  const [cases, setCases] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [overlapData, setOverlapData] = useState({ summary: {}, alerts: [] });
  const [history, setHistory] = useState([]);
  const [reportsSummary, setReportsSummary] = useState(null);

  // Loading & Feedback States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Modals
  const [showCreateCaseModal, setShowCreateCaseModal] = useState(false);
  const [showCreateInstModal, setShowCreateInstModal] = useState(false);
  const [selectedCaseDetail, setSelectedCaseDetail] = useState(null);
  const [reviewModalInst, setReviewModalInst] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

  // Filters: All Cases
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [bureauFilter, setBureauFilter] = useState('All');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Filters: Overlap Alerts
  const [overlapSearch, setOverlapSearch] = useState('');
  const [overlapBureauFilter, setOverlapBureauFilter] = useState('All');
  const [overlapReviewFilter, setOverlapReviewFilter] = useState('All');
  const [expandedOverlapInsts, setExpandedOverlapInsts] = useState({});

  // Filters: Workflow History
  const [historyCaseFilter, setHistoryCaseFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

  // Filters: Institutions
  const [instSearch, setInstSearch] = useState('');
  const [expandedInstId, setExpandedInstId] = useState(null);

  // Create Case Form State
  const [caseForm, setCaseForm] = useState({
    institution_id: '',
    bureau: 'PGRC',
    category: '',
    description: '',
    priority: 'Medium',
    assigned_officer: '',
    due_date: ''
  });
  const [savingCase, setSavingCase] = useState(false);

  // Create Institution Form State
  const [instForm, setInstForm] = useState({
    institution_name: '',
    institution_code: '',
    state: '',
    city: '',
    address: '',
    contact_email: '',
    contact_phone: ''
  });
  const [savingInst, setSavingInst] = useState(false);

  // Quick updating tracking
  const [updatingCaseId, setUpdatingCaseId] = useState(null);

  const isAdmin = user?.role === 'Admin';

  // API Request Helper
  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      logout('Your session has expired. Please log in again.');
      throw new Error('Your session has expired. Please log in again.');
    }

    return response;
  }

  function logout(reason = '') {
    localStorage.removeItem('casesync_token');
    localStorage.removeItem('casesync_user');
    setToken('');
    setUser(null);
    setPassword('');
    setCases([]);
    setInstitutions([]);
    setOverlapData({ summary: {}, alerts: [] });
    setHistory([]);
    setReportsSummary(null);
    setActivePage('Dashboard');
    setMessage('');
    setError('');
    setLoginError(reason);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Login failed.');
      }

      localStorage.setItem('casesync_token', result.token);
      localStorage.setItem('casesync_user', JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      setPassword('');
      setActivePage('Dashboard');
    } catch (err) {
      setLoginError(err.message || 'Unable to connect to the backend.');
    } finally {
      setLoginLoading(false);
    }
  }

  // Load All Primary Data
  async function loadData() {
    if (!token) return;
    setLoading(true);
    setError('');

    try {
      const [casesRes, instsRes, overlapRes, reportsRes] = await Promise.all([
        apiRequest('/cases'),
        apiRequest('/institutions'),
        apiRequest('/overlap-alerts'),
        apiRequest('/reports/summary')
      ]);

      if (casesRes.ok) {
        setCases(await casesRes.json());
      }
      if (instsRes.ok) {
        setInstitutions(await instsRes.json());
      }
      if (overlapRes.ok) {
        setOverlapData(await overlapRes.json());
      }
      if (reportsRes.ok) {
        setReportsSummary(await reportsRes.json());
      }
    } catch (err) {
      if (!err.message?.includes('session has expired')) {
        console.error(err);
        setError(err.message || 'Unable to load dashboard data.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Load Workflow History
  async function loadHistory(caseId = historyCaseFilter) {
    if (!token) return;
    try {
      const path = caseId && caseId !== 'all' ? `/api/history?caseId=${caseId}` : '/api/history';
      const res = await apiRequest(path);
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (token && user) {
      loadData();
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (activePage === 'Workflow History' && token) {
      loadHistory(historyCaseFilter);
    }
  }, [activePage, historyCaseFilter, token]);

  // Navigate & Reset State
  function navigateTo(page, filters = {}) {
    setActivePage(page);
    setMessage('');
    setError('');

    if (filters.status) setStatusFilter(filters.status);
    if (filters.overdue) setOverdueOnly(true);
    if (filters.bureau) setBureauFilter(filters.bureau);
    if (filters.overlapReview) setOverlapReviewFilter(filters.overlapReview);
  }

  // Create Case Submit Handler
  async function handleCreateCase(e) {
    e.preventDefault();
    setSavingCase(true);
    setMessage('');

    try {
      const res = await apiRequest('/cases', {
        method: 'POST',
        body: JSON.stringify({
          ...caseForm,
          institution_id: Number(caseForm.institution_id)
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Could not create case.');

      setMessage(`Case ${result.case_reference} created successfully!`);
      setShowCreateCaseModal(false);
      setCaseForm({
        institution_id: '',
        bureau: 'PGRC',
        category: '',
        description: '',
        priority: 'Medium',
        assigned_officer: '',
        due_date: ''
      });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to create case.');
    } finally {
      setSavingCase(false);
    }
  }

  // Create Institution Submit Handler
  async function handleCreateInst(e) {
    e.preventDefault();
    setSavingInst(true);
    setMessage('');

    try {
      const res = await apiRequest('/institutions', {
        method: 'POST',
        body: JSON.stringify(instForm)
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Could not register institution.');

      setMessage(`Institution "${result.institution_name}" registered successfully!`);
      setShowCreateInstModal(false);
      setInstForm({
        institution_name: '',
        institution_code: '',
        state: '',
        city: '',
        address: '',
        contact_email: '',
        contact_phone: ''
      });
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to register institution.');
    } finally {
      setSavingInst(false);
    }
  }

  // Quick Status Change on Case Table
  async function handleQuickStatusChange(caseId, newStatus) {
    const cur = cases.find(c => Number(c.case_id) === Number(caseId));
    if (!cur || cur.status === newStatus) return;

    setUpdatingCaseId(caseId);
    setMessage('');
    setError('');

    try {
      const res = await apiRequest(`/cases/${caseId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to update status.');

      setMessage(`${cur.case_reference}: Status updated to "${newStatus}"`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to update case status.');
    } finally {
      setUpdatingCaseId(null);
    }
  }

  // Open Full Case Details Modal
  async function openCaseDetails(caseId) {
    try {
      const res = await apiRequest(`/cases/${caseId}`);
      if (res.ok) {
        setSelectedCaseDetail(await res.json());
      }
    } catch (err) {
      setError('Unable to load case details.');
    }
  }

  // Update Case Details from Modal
  async function handleUpdateCaseDetails(e) {
    e.preventDefault();
    if (!selectedCaseDetail) return;

    const form = e.target;
    const bureau = form.bureau ? form.bureau.value : undefined;
    const priority = form.priority ? form.priority.value : undefined;
    const status = form.status ? form.status.value : undefined;
    const notes = form.notes ? form.notes.value : undefined;

    try {
      const res = await apiRequest(`/cases/${selectedCaseDetail.case_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ bureau, priority, status, notes })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to update case.');

      setMessage(`Case ${selectedCaseDetail.case_reference} updated successfully.`);
      setSelectedCaseDetail(null);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to update case details.');
    }
  }

  // Submit Overlap Alert Review
  async function handleReviewSubmit(e) {
    e.preventDefault();
    if (!reviewModalInst) return;

    setReviewLoading(true);
    try {
      const targetStatus = reviewModalInst.review_status === 'Reviewed' ? 'Pending Review' : 'Reviewed';
      const res = await apiRequest(`/overlap-alerts/${reviewModalInst.institution_id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          review_status: targetStatus,
          notes: reviewNote
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to submit review.');

      setMessage(result.message);
      setReviewModalInst(null);
      setReviewNote('');
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to update review status.');
    } finally {
      setReviewLoading(false);
    }
  }

  // Toggle Overlap Card Accordion
  function toggleOverlapExpanded(instId) {
    setExpandedOverlapInsts(prev => ({
      ...prev,
      [instId]: !prev[instId]
    }));
  }

  // Date Formatters
  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  function formatDateTime(d) {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Bureau Pill Class
  function getBureauClass(bureau) {
    const b = (bureau || '').toLowerCase();
    if (b.includes('pgrc')) return 'bureau-pgrc';
    if (b.includes('regulat')) return 'bureau-reg';
    if (b.includes('approv')) return 'bureau-appr';
    if (b.includes('finan')) return 'bureau-fin';
    return '';
  }

  // Status Pill Class
  function getStatusClass(status) {
    if (status === 'Pending') return 'pill-pending';
    if (status === 'Under Process') return 'pill-process';
    if (status === 'Resolved') return 'pill-resolved';
    return 'pill-rejected';
  }

  // Priority Pill Class
  function getPriorityClass(p) {
    if (p === 'High') return 'priority-high';
    if (p === 'Medium') return 'priority-medium';
    return 'priority-low';
  }

  // Filtered Cases Memo
  const filteredCases = useMemo(() => {
    const s = search.trim().toLowerCase();
    const now = new Date();

    return cases.filter(item => {
      const matchSearch = !s ||
        item.case_reference?.toLowerCase().includes(s) ||
        item.institution_name?.toLowerCase().includes(s) ||
        item.category?.toLowerCase().includes(s) ||
        item.bureau?.toLowerCase().includes(s) ||
        item.assigned_officer?.toLowerCase().includes(s);

      const matchStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchPriority = priorityFilter === 'All' || item.priority === priorityFilter;
      const matchBureau = bureauFilter === 'All' || item.bureau === bureauFilter;
      const matchOverdue = !overdueOnly || (
        !['Resolved', 'Rejected'].includes(item.status) &&
        item.due_date &&
        new Date(item.due_date) < now
      );

      return matchSearch && matchStatus && matchPriority && matchBureau && matchOverdue;
    });
  }, [cases, search, statusFilter, priorityFilter, bureauFilter, overdueOnly]);

  // Filtered Overlap Alerts Memo
  const filteredOverlapAlerts = useMemo(() => {
    const s = overlapSearch.trim().toLowerCase();
    return (overlapData.alerts || []).filter(alert => {
      const matchSearch = !s ||
        alert.institution_name?.toLowerCase().includes(s) ||
        alert.institution_code?.toLowerCase().includes(s) ||
        alert.cases.some(c => c.case_reference.toLowerCase().includes(s));

      const matchBureau = overlapBureauFilter === 'All' ||
        alert.distinct_bureaus.some(b => b.toLowerCase() === overlapBureauFilter.toLowerCase());

      const matchReview = overlapReviewFilter === 'All' ||
        alert.review_status === overlapReviewFilter;

      return matchSearch && matchBureau && matchReview;
    });
  }, [overlapData.alerts, overlapSearch, overlapBureauFilter, overlapReviewFilter]);

  // Filtered History Memo
  const filteredHistory = useMemo(() => {
    const s = historySearch.trim().toLowerCase();
    return history.filter(item => {
      if (!s) return true;
      return item.case_reference?.toLowerCase().includes(s) ||
        item.institution_name?.toLowerCase().includes(s) ||
        item.action_taken?.toLowerCase().includes(s) ||
        item.changed_by?.toLowerCase().includes(s);
    });
  }, [history, historySearch]);

  // Navigation Items
  const navItems = [
    { label: 'Dashboard', icon: '▦' },
    { label: 'All Cases', icon: '▤', badge: cases.length },
    { label: 'Institutions', icon: '🏢', badge: institutions.length },
    { label: 'Overlap Alerts', icon: '⚠', badge: overlapData.summary?.institutions_flagged || 0, badgeWarn: true },
    { label: 'Workflow History', icon: '↻' },
    { label: 'Reports', icon: '▥' }
  ];

  // Distinct Bureau List for filters
  const distinctBureausList = useMemo(() => {
    return [...new Set(cases.map(c => c.bureau?.trim()).filter(Boolean))].sort();
  }, [cases]);

  // ==========================================================================
  // RENDER: LOGIN SCREEN
  // ==========================================================================
  if (!token || !user) {
    return (
      <div className="login-portal-wrapper">
        <div className="login-portal-container">
          {/* LEFT: Government Hero / Official Branding Section */}
          <div className="login-hero-section">
            <div className="login-hero-content">
              <div className="gov-header-tag">
                <span className="gov-crest-icon">🏛</span>
                <div>
                  <div className="gov-title">ALL INDIA COUNCIL FOR TECHNICAL EDUCATION</div>
                  <div className="gov-subtitle">Ministry of Education, Government of India</div>
                </div>
              </div>

              <div className="hero-main-title">
                <h1>AICTE <span>CaseSync</span></h1>
                <p className="hero-lead">
                  Integrated Grievance Monitoring &amp; Cross-Bureau Overlap Tracking System
                </p>
              </div>

              <div className="hero-features-list">
                <div className="hero-feature-item">
                  <div className="feature-icon">🔍</div>
                  <div>
                    <strong>Cross-Bureau Overlap Detection</strong>
                    <p>Detect institutions with simultaneous complaints spanning PGRC, Regulation, Approval, and Finance cells.</p>
                  </div>
                </div>

                <div className="hero-feature-item">
                  <div className="feature-icon">⚡</div>
                  <div>
                    <strong>Unified Case Tracking &amp; Reassignment</strong>
                    <p>Track complaint lifecycles, reassign jurisdiction, and coordinate multi-bureau inquiries.</p>
                  </div>
                </div>

                <div className="hero-feature-item">
                  <div className="feature-icon">🛡</div>
                  <div>
                    <strong>Verifiable Audit Trail</strong>
                    <p>Chronological history of case updates, reviewer remarks, and institutional compliance actions.</p>
                  </div>
                </div>
              </div>

              <div className="login-hero-footer">
                <span>🔒 Authorized Personnel Portal • Government of India</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Login Card Section */}
          <div className="login-form-section">
            <div className="login-form-card">
              <div className="login-form-header">
                <h2>Sign In to Portal</h2>
                <p>Enter your departmental credentials to access the administrative workspace.</p>
              </div>

              {loginError && (
                <div className="login-alert-banner">
                  <span className="alert-icon">⚠</span>
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="login-portal-form">
                <div className="portal-form-group">
                  <label className="portal-label">Official Email Address</label>
                  <div className="portal-input-wrap">
                    <span className="input-prefix-icon">✉</span>
                    <input
                      type="email"
                      className="portal-input"
                      placeholder="e.g. admin@aicte.gov.in"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="portal-form-group">
                  <label className="portal-label">Password</label>
                  <div className="portal-input-wrap">
                    <span className="input-prefix-icon">🔒</span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="portal-input"
                      placeholder="Enter account password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? '👁' : '👁‍🗨'}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="portal-login-btn"
                  disabled={loginLoading}
                >
                  {loginLoading ? (
                    <span>Authenticating Credentials...</span>
                  ) : (
                    <>
                      <span>Sign In to Dashboard</span>
                      <span className="btn-arrow">→</span>
                    </>
                  )}
                </button>
              </form>

              {/* DEMO ACCESS ROLES */}
              <div className="quick-access-section">
                <div className="quick-access-header">
                  <span>Departmental Access Roles</span>
                </div>
                <div className="quick-access-grid">
                  <div
                    className={`quick-access-card ${email === 'admin@aicte.gov.in' ? 'active' : ''}`}
                    onClick={() => {
                      setEmail('admin@aicte.gov.in');
                      setPassword('Admin@123');
                    }}
                  >
                    <div className="role-icon">👑</div>
                    <div className="role-text">
                      <strong>Central Admin</strong>
                      <small>Full System Privileges</small>
                    </div>
                  </div>

                  <div
                    className={`quick-access-card ${email === 'officer.pgrc@aicte.gov.in' ? 'active' : ''}`}
                    onClick={() => {
                      setEmail('officer.pgrc@aicte.gov.in');
                      setPassword('Officer@123');
                    }}
                  >
                    <div className="role-icon">🛡</div>
                    <div className="role-text">
                      <strong>PGRC Officer</strong>
                      <small>Public Grievances Cell</small>
                    </div>
                  </div>

                  <div
                    className={`quick-access-card ${email === 'officer.reg@aicte.gov.in' ? 'active' : ''}`}
                    onClick={() => {
                      setEmail('officer.reg@aicte.gov.in');
                      setPassword('Officer@123');
                    }}
                  >
                    <div className="role-icon">⚖</div>
                    <div className="role-text">
                      <strong>Regulation Officer</strong>
                      <small>Norms &amp; Compliance</small>
                    </div>
                  </div>
                </div>
              </div>

              <div className="login-legal-footer">
                AICTE HQ: Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // RENDER: MAIN APPLICATION WORKSPACE
  // ==========================================================================
  return (
    <div className="app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            <div className="sidebar-emblem">🏛</div>
            <div>
              <h2 className="sidebar-title">Case<span>Sync</span></h2>
              <p className="sidebar-subtitle">AICTE Official Portal</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main Navigation</div>
          {navItems.map(item => (
            <div
              key={item.label}
              className={`nav-item ${activePage === item.label ? 'active' : ''}`}
              onClick={() => navigateTo(item.label)}
              role="button"
              tabIndex={0}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigateTo(item.label)}
            >
              <div className="nav-item-left">
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="nav-badge">{item.badge}</span>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">
            {(user.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="user-meta">
            <p className="user-name">{user.name}</p>
            <span className="user-role-badge">{user.role} • {user.bureau || 'HQ'}</span>
          </div>
          <button className="logout-icon-btn" title="Sign out" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </aside>

      {/* MAIN VIEW */}
      <main className="main">
        {/* TOPBAR */}
        <header className="topbar">
          <div>
            <p className="topbar-breadcrumbs">AICTE Central Grievance Portal / {activePage}</p>
            <h1 className="topbar-heading">
              {activePage === 'Dashboard' && 'Monitoring & Overlap Dashboard'}
              {activePage === 'All Cases' && 'Institutions Complaint Cases'}
              {activePage === 'Institutions' && 'Registered Technical Institutions'}
              {activePage === 'Overlap Alerts' && 'Cross-Bureau Overlap Alerts'}
              {activePage === 'Workflow History' && 'Audit Trail & Workflow History'}
              {activePage === 'Reports' && 'Analytics & Performance Reports'}
            </h1>
            <p className="topbar-subtext">
              {activePage === 'Dashboard' && 'Real-time overview of complaint cases, cell distribution, and cross-bureau flags.'}
              {activePage === 'All Cases' && 'Search, filter, update statuses, and inspect individual case details.'}
              {activePage === 'Institutions' && 'Directory of institutions and their active complaint volumes.'}
              {activePage === 'Overlap Alerts' && 'Detect and coordinate cases where one institution has active complaints across multiple bureaus.'}
              {activePage === 'Workflow History' && 'Immutable audit log of all case creation, reassignments, and status changes.'}
              {activePage === 'Reports' && 'Consolidated resolution metrics, overdue analysis, and bureau-level breakdowns.'}
            </p>
          </div>

          <div className="topbar-actions">
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowCreateCaseModal(true)}>
                <span>+</span> New Complaint Case
              </button>
            )}
            {isAdmin && activePage === 'Institutions' && (
              <button className="btn btn-secondary" onClick={() => setShowCreateInstModal(true)}>
                + Add Institution
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={loadData} title="Refresh all records">
              ↻ Refresh
            </button>
          </div>
        </header>

        {/* FEEDBACK BANNERS */}
        {message && (
          <div className="alert-banner alert-success">
            <span>✔ {message}</span>
            <button className="modal-close-btn" onClick={() => setMessage('')}>✕</button>
          </div>
        )}
        {error && (
          <div className="alert-banner alert-error">
            <span>⚠ {error}</span>
            <button className="modal-close-btn" onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* ================================================================== */}
        {/* VIEW 1: DASHBOARD                                                 */}
        {/* ================================================================== */}
        {activePage === 'Dashboard' && (
          <>
            {/* KPI METRIC CARDS */}
            <div className="stats-grid">
              <div className="metric-card" onClick={() => navigateTo('All Cases')}>
                <div className="metric-card-top">
                  <span className="metric-label">Total Cases</span>
                  <div className="metric-icon-bubble bubble-blue">📁</div>
                </div>
                <div className="metric-value">{loading ? '...' : cases.length}</div>
                <p className="metric-subtext">Across all AICTE cells</p>
              </div>

              <div className="metric-card" onClick={() => navigateTo('All Cases', { status: 'Pending' })}>
                <div className="metric-card-top">
                  <span className="metric-label">Pending</span>
                  <div className="metric-icon-bubble bubble-amber">⏳</div>
                </div>
                <div className="metric-value">
                  {loading ? '...' : cases.filter(c => c.status === 'Pending').length}
                </div>
                <p className="metric-subtext">Awaiting preliminary review</p>
              </div>

              <div className="metric-card" onClick={() => navigateTo('All Cases', { status: 'Under Process' })}>
                <div className="metric-card-top">
                  <span className="metric-label">Under Process</span>
                  <div className="metric-icon-bubble bubble-cyan">⚙</div>
                </div>
                <div className="metric-value">
                  {loading ? '...' : cases.filter(c => c.status === 'Under Process').length}
                </div>
                <p className="metric-subtext">Active inquiry in progress</p>
              </div>

              <div className="metric-card" onClick={() => navigateTo('All Cases', { status: 'Resolved' })}>
                <div className="metric-card-top">
                  <span className="metric-label">Resolved</span>
                  <div className="metric-icon-bubble bubble-emerald">✔</div>
                </div>
                <div className="metric-value">
                  {loading ? '...' : cases.filter(c => c.status === 'Resolved').length}
                </div>
                <p className="metric-subtext">Successfully concluded</p>
              </div>

              <div className="metric-card" onClick={() => navigateTo('Overlap Alerts')}>
                <div className="metric-card-top">
                  <span className="metric-label">Cross-Bureau Alerts</span>
                  <div className="metric-icon-bubble bubble-rose">⚠</div>
                </div>
                <div className="metric-value" style={{ color: '#b91c1c' }}>
                  {loading ? '...' : overlapData.summary?.institutions_flagged || 0}
                </div>
                <p className="metric-subtext">Institutions with multi-cell cases</p>
              </div>
            </div>

            {/* CROSS-BUREAU OVERLAP ALERT PREVIEW WIDGET */}
            <div className="panel" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">
                    <span style={{ color: '#d97706' }}>⚠</span> Cross-Bureau Overlap Alerts
                  </h2>
                  <p className="panel-desc">
                    Institutions flagged with simultaneous complaint cases spanning multiple distinct AICTE Bureaus or Cells.
                  </p>
                </div>
                <button className="btn btn-outline-primary btn-sm" onClick={() => navigateTo('Overlap Alerts')}>
                  View All Alerts ({overlapData.summary?.institutions_flagged || 0}) →
                </button>
              </div>

              {loading ? (
                <p>Loading overlap alert analysis...</p>
              ) : (overlapData.alerts || []).length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✔</div>
                  <h3 className="empty-state-title">No Cross-Bureau Overlaps Detected</h3>
                  <p className="empty-state-desc">
                    Currently no institution has cases open across multiple distinct bureaus. All complaints are contained within single bureaus.
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Flagged Institution</th>
                        <th>State</th>
                        <th>Related Cases</th>
                        <th>Distinct Bureaus / Cells</th>
                        <th>Review Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overlapData.alerts || []).slice(0, 3).map(alert => (
                        <tr key={alert.institution_id}>
                          <td>
                            <strong className="cell-bold">{alert.institution_name}</strong>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Code: {alert.institution_code}</div>
                          </td>
                          <td>{alert.state}</td>
                          <td>
                            <span className="cell-bold">{alert.case_count} cases</span>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {alert.cases.map(c => c.case_reference).join(', ')}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {alert.distinct_bureaus.map(b => (
                                <span key={b} className={`bureau-pill ${getBureauClass(b)}`}>{b}</span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span className={`status-pill ${alert.review_status === 'Reviewed' ? 'pill-resolved' : 'pill-pending'}`}>
                              {alert.review_status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                navigateTo('Overlap Alerts');
                                setExpandedOverlapInsts({ [alert.institution_id]: true });
                              }}
                            >
                              Inspect Overlap
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CASES BY BUREAU BREAKDOWN & RECENT ACTIVITY */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 24 }}>
              {/* Bureau Breakdown */}
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Cases by AICTE Bureau / Cell</h2>
                    <p className="panel-desc">Workload volume and resolution distribution.</p>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Bureau</th>
                        <th>Total</th>
                        <th>Active</th>
                        <th>Resolved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportsSummary?.by_bureau || []).map(item => (
                        <tr key={item.bureau}>
                          <td>
                            <span className={`bureau-pill ${getBureauClass(item.bureau)}`}>
                              {item.bureau}
                            </span>
                          </td>
                          <td><strong>{item.total}</strong></td>
                          <td>
                            <span style={{ color: '#d97706', fontWeight: 600 }}>
                              {item.pending + item.underProcess}
                            </span>
                          </td>
                          <td>
                            <span style={{ color: '#059669', fontWeight: 600 }}>
                              {item.resolved}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(!reportsSummary || reportsSummary.by_bureau.length === 0) && (
                        <tr><td colSpan="4">No bureau data available.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Recent Case Activity</h2>
                    <p className="panel-desc">Recorded status transitions and audit logs.</p>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigateTo('Workflow History')}>
                    Full History →
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(reportsSummary?.recent_activity || []).slice(0, 5).map(act => (
                    <div
                      key={act.history_id}
                      style={{
                        padding: '10px 14px',
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        fontSize: 12.5
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <strong style={{ color: '#1e3a8a' }}>{act.case_reference}</strong>
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>{formatDateTime(act.changed_at)}</span>
                      </div>
                      <div style={{ color: '#334155', marginBottom: 6 }}>{act.action_taken}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>By {act.changed_by}</span>
                        {act.new_status && (
                          <span className={`status-pill ${getStatusClass(act.new_status)}`}>
                            {act.new_status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!reportsSummary || reportsSummary.recent_activity.length === 0) && (
                    <p className="empty-state-desc">No recent workflow activity recorded.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================================================================== */}
        {/* VIEW 2: CROSS-BUREAU OVERLAP ALERTS (HIGHEST PRIORITY FEATURE)     */}
        {/* ================================================================== */}
        {activePage === 'Overlap Alerts' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  <span style={{ color: '#d97706' }}>⚠</span> Institution-Level Cross-Bureau Overlap Alerts
                </h2>
                <p className="panel-desc">
                  An institution is flagged ONLY when it has cases associated with more than one distinct AICTE bureau/cell.
                  Multiple cases within the same bureau do NOT trigger an alert.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="brand-badge" style={{ fontSize: 12, padding: '6px 12px' }}>
                  {filteredOverlapAlerts.length} FLAGGED INSTITUTIONS
                </span>
              </div>
            </div>

            {/* OVERLAP SUMMARY CARDS */}
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              <div className="metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Institutions Checked</span>
                  <div className="metric-icon-bubble bubble-blue">🏢</div>
                </div>
                <div className="metric-value">{overlapData.summary?.total_institutions_checked || institutions.length}</div>
                <p className="metric-subtext">Total registered in database</p>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Flagged Institutions</span>
                  <div className="metric-icon-bubble bubble-rose">⚠</div>
                </div>
                <div className="metric-value" style={{ color: '#b91c1c' }}>
                  {overlapData.summary?.institutions_flagged || 0}
                </div>
                <p className="metric-subtext">Cases span &gt;1 distinct bureaus</p>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Related Cases</span>
                  <div className="metric-icon-bubble bubble-amber">📑</div>
                </div>
                <div className="metric-value">{overlapData.summary?.related_cases_count || 0}</div>
                <p className="metric-subtext">Across flagged institutions</p>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Distinct Bureaus Involved</span>
                  <div className="metric-icon-bubble bubble-cyan">🏛</div>
                </div>
                <div className="metric-value">{overlapData.summary?.distinct_bureaus_count || 0}</div>
                <p className="metric-subtext">
                  {(overlapData.summary?.distinct_bureaus_involved || []).join(', ') || 'None'}
                </p>
              </div>
            </div>

            {/* FILTER BAR */}
            <div className="filter-bar">
              <div className="filter-input-wrap">
                <span className="filter-search-icon">🔍</span>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search flagged institution, code, or case reference..."
                  value={overlapSearch}
                  onChange={e => setOverlapSearch(e.target.value)}
                />
              </div>

              <select
                className="filter-select"
                value={overlapBureauFilter}
                onChange={e => setOverlapBureauFilter(e.target.value)}
              >
                <option value="All">All Bureaus Involved</option>
                {distinctBureausList.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <select
                className="filter-select"
                value={overlapReviewFilter}
                onChange={e => setOverlapReviewFilter(e.target.value)}
              >
                <option value="All">All Review Statuses</option>
                <option value="Pending Review">Pending Review</option>
                <option value="Reviewed">Reviewed</option>
              </select>

              {(overlapSearch || overlapBureauFilter !== 'All' || overlapReviewFilter !== 'All') && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setOverlapSearch('');
                    setOverlapBureauFilter('All');
                    setOverlapReviewFilter('All');
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* OVERLAP ALERTS LIST */}
            {loading ? (
              <p>Analyzing cross-bureau overlap records...</p>
            ) : filteredOverlapAlerts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✔</div>
                <h3 className="empty-state-title">No Potential Cross-Bureau Overlaps Found</h3>
                <p className="empty-state-desc">
                  Institutions with active cases across different bureaus or cells will appear here.
                  Institutions with cases in only one bureau (e.g. Sunrise Institute of Technology) are not flagged.
                </p>
              </div>
            ) : (
              <div>
                {filteredOverlapAlerts.map(alert => {
                  const isExpanded = !!expandedOverlapInsts[alert.institution_id];
                  const isReviewed = alert.review_status === 'Reviewed';

                  return (
                    <div key={alert.institution_id} className={`overlap-card ${isReviewed ? 'reviewed' : ''}`}>
                      {/* CARD HEADER */}
                      <div className="overlap-card-header">
                        <div>
                          <h3 className="overlap-inst-title">
                            <span>{alert.institution_name}</span>
                            <span className="cell-code">{alert.institution_code}</span>
                            <span className="brand-badge" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
                              {alert.case_count} Related Cases
                            </span>
                          </h3>
                          <div className="overlap-inst-meta">
                            <span>📍 {alert.city}, {alert.state}</span>
                            <span>•</span>
                            <span>Institution ID: #{alert.institution_id}</span>
                            <span>•</span>
                            <span className={`status-pill ${isReviewed ? 'pill-resolved' : 'pill-pending'}`}>
                              {alert.review_status}
                            </span>
                            {isReviewed && alert.reviewed_by && (
                              <span style={{ fontSize: 11, color: '#059669' }}>
                                (Reviewed by {alert.reviewed_by} on {formatDate(alert.reviewed_at)})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* CARD ACTIONS */}
                        <div className="overlap-card-actions">
                          <button
                            className={`btn btn-sm ${isReviewed ? 'btn-secondary' : 'btn-success'}`}
                            onClick={() => {
                              setReviewModalInst(alert);
                              setReviewNote(alert.review_notes || '');
                            }}
                          >
                            {isReviewed ? 'Reopen Alert' : '✔ Mark as Reviewed'}
                          </button>

                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => toggleOverlapExpanded(alert.institution_id)}
                          >
                            {isExpanded ? '▲ Hide Cases' : `▼ View ${alert.case_count} Cases`}
                          </button>
                        </div>
                      </div>

                      {/* EXPLANATION BANNER */}
                      <div className="overlap-reason-banner">
                        <span>ℹ</span>
                        <span>{alert.explanation}</span>
                      </div>

                      {/* DISTINCT BUREAUS ROW */}
                      <div className="overlap-bureaus-row">
                        <span className="overlap-bureaus-label">Spanning {alert.bureau_count} Bureaus:</span>
                        {alert.distinct_bureaus.map(b => (
                          <span key={b} className={`bureau-pill ${getBureauClass(b)}`}>
                            {b} ({alert.cases.filter(c => c.bureau === b).length} cases)
                          </span>
                        ))}
                      </div>

                      {/* EXPANDED CASES ACCORDION TABLE */}
                      {isExpanded && (
                        <div className="overlap-cases-container">
                          <h4 className="overlap-cases-title">
                            Associated Complaint Cases for this Institution ({alert.cases.length}):
                          </h4>

                          <div className="table-responsive">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Case Reference</th>
                                  <th>Bureau / Cell</th>
                                  <th>Category</th>
                                  <th>Priority</th>
                                  <th>Status</th>
                                  <th>Assigned Officer</th>
                                  <th>Due Date</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {alert.cases.map(c => (
                                  <tr key={c.case_id}>
                                    <td><strong className="cell-code">{c.case_reference}</strong></td>
                                    <td><span className={`bureau-pill ${getBureauClass(c.bureau)}`}>{c.bureau}</span></td>
                                    <td>{c.category}</td>
                                    <td><span className={`priority-pill ${getPriorityClass(c.priority)}`}>{c.priority}</span></td>
                                    <td><span className={`status-pill ${getStatusClass(c.status)}`}>{c.status}</span></td>
                                    <td>{c.assigned_officer || '—'}</td>
                                    <td>{formatDate(c.due_date)}</td>
                                    <td>
                                      <button className="btn btn-secondary btn-sm" onClick={() => openCaseDetails(c.case_id)}>
                                        Inspect
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="metric-subtext" style={{ marginTop: 20 }}>
              Note: Cross-bureau alerts are derived directly from active complaints stored in the database.
              Institutions with multiple complaints restricted to a single bureau do NOT trigger cross-bureau alerts.
            </p>
          </section>
        )}

        {/* ================================================================== */}
        {/* VIEW 3: ALL CASES MANAGEMENT                                       */}
        {/* ================================================================== */}
        {activePage === 'All Cases' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">All Institution Complaint Cases</h2>
                <p className="panel-desc">Search, filter, update statuses, or reassign cases across bureaus.</p>
              </div>
              <span className="brand-badge" style={{ fontSize: 12, padding: '6px 12px' }}>
                {filteredCases.length} OF {cases.length} CASES
              </span>
            </div>

            {/* FILTER BAR */}
            <div className="filter-bar">
              <div className="filter-input-wrap">
                <span className="filter-search-icon">🔍</span>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search case reference, institution, category, officer..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <select className="filter-select" value={bureauFilter} onChange={e => setBureauFilter(e.target.value)}>
                <option value="All">All Bureaus</option>
                {distinctBureausList.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Under Process">Under Process</option>
                <option value="Resolved">Resolved</option>
                <option value="Rejected">Rejected</option>
              </select>

              <select className="filter-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                <option value="All">All Priorities</option>
                <option value="High">High Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="Low">Low Priority</option>
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={e => setOverdueOnly(e.target.checked)}
                />
                Overdue Only
              </label>

              {(search || statusFilter !== 'All' || priorityFilter !== 'All' || bureauFilter !== 'All' || overdueOnly) && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('All');
                    setPriorityFilter('All');
                    setBureauFilter('All');
                    setOverdueOnly(false);
                  }}
                >
                  Reset Filters
                </button>
              )}
            </div>

            {/* CASE TABLE */}
            {loading ? (
              <p>Loading cases from database...</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Case Ref</th>
                      <th>Institution</th>
                      <th>Category</th>
                      <th>Bureau / Cell</th>
                      <th>Priority</th>
                      <th>Due Date</th>
                      <th>Current Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map(item => (
                      <tr key={item.case_id}>
                        <td>
                          <span className="cell-code" style={{ cursor: 'pointer' }} onClick={() => openCaseDetails(item.case_id)}>
                            {item.case_reference}
                          </span>
                        </td>
                        <td>
                          <strong className="cell-bold">{item.institution_name}</strong>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{item.state || 'India'}</div>
                        </td>
                        <td>{item.category}</td>
                        <td>
                          <span className={`bureau-pill ${getBureauClass(item.bureau)}`}>
                            {item.bureau}
                          </span>
                        </td>
                        <td>
                          <span className={`priority-pill ${getPriorityClass(item.priority)}`}>
                            {item.priority}
                          </span>
                        </td>
                        <td>
                          <span>{formatDate(item.due_date)}</span>
                          {item.due_date && new Date(item.due_date) < new Date() && !['Resolved', 'Rejected'].includes(item.status) && (
                            <span style={{ display: 'block', color: '#b91c1c', fontSize: 10.5, fontWeight: 700 }}>
                              OVERDUE
                            </span>
                          )}
                        </td>
                        <td>
                          <select
                            className={`filter-select ${getStatusClass(item.status)}`}
                            style={{ padding: '4px 8px', fontSize: 12 }}
                            value={item.status}
                            disabled={updatingCaseId === item.case_id || (!isAdmin && item.assigned_officer !== user.name)}
                            onChange={e => handleQuickStatusChange(item.case_id, e.target.value)}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Under Process">Under Process</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                        </td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => openCaseDetails(item.case_id)}>
                            Details →
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCases.length === 0 && (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: 36 }}>
                          No cases match the selected search and filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ================================================================== */}
        {/* VIEW 4: INSTITUTIONS DIRECTORY                                     */}
        {/* ================================================================== */}
        {activePage === 'Institutions' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Registered Technical Institutions</h2>
                <p className="panel-desc">All colleges and polytechnics recorded in AICTE CaseSync.</p>
              </div>
              <span className="brand-badge" style={{ fontSize: 12, padding: '6px 12px' }}>
                {institutions.length} INSTITUTIONS
              </span>
            </div>

            <div className="filter-bar">
              <div className="filter-input-wrap">
                <span className="filter-search-icon">🔍</span>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search institution name, code, state, city..."
                  value={instSearch}
                  onChange={e => setInstSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <p>Loading institutions...</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Institution Code</th>
                      <th>Institution Name</th>
                      <th>State / City</th>
                      <th>Total Cases</th>
                      <th>Active Cases</th>
                      <th>Overlap Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {institutions
                      .filter(inst => {
                        const s = instSearch.trim().toLowerCase();
                        return !s ||
                          inst.institution_name?.toLowerCase().includes(s) ||
                          inst.institution_code?.toLowerCase().includes(s) ||
                          inst.state?.toLowerCase().includes(s) ||
                          inst.city?.toLowerCase().includes(s);
                      })
                      .map(inst => {
                        const instCases = cases.filter(c => c.institution_id === inst.institution_id);
                        const distinctBureaus = [...new Set(instCases.map(c => c.bureau?.trim()).filter(Boolean))];
                        const hasOverlap = distinctBureaus.length > 1;
                        const isExpanded = expandedInstId === inst.institution_id;

                        return (
                          <>
                            <tr key={inst.institution_id}>
                              <td><span className="cell-code">{inst.institution_code}</span></td>
                              <td><strong className="cell-bold">{inst.institution_name}</strong></td>
                              <td>{inst.city}, {inst.state}</td>
                              <td>{instCases.length}</td>
                              <td>
                                <span style={{ color: '#d97706', fontWeight: 600 }}>
                                  {instCases.filter(c => ['Pending', 'Under Process'].includes(c.status)).length}
                                </span>
                              </td>
                              <td>
                                {hasOverlap ? (
                                  <span className="priority-pill priority-high" title="Cases span multiple bureaus">
                                    ⚠ Cross-Bureau ({distinctBureaus.length})
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 11.5, color: '#64748b' }}>
                                    {distinctBureaus.length === 1 ? distinctBureaus[0] : 'No Cases'}
                                  </span>
                                )}
                              </td>
                              <td>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setExpandedInstId(isExpanded ? null : inst.institution_id)}
                                >
                                  {isExpanded ? 'Hide' : `Cases (${instCases.length})`}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`expanded-${inst.institution_id}`}>
                                <td colSpan="7" style={{ background: '#f8fafc', padding: '16px 24px' }}>
                                  <strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#475569' }}>
                                    Cases for {inst.institution_name}:
                                  </strong>
                                  {instCases.length === 0 ? (
                                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                                      No complaint cases registered for this institution.
                                    </p>
                                  ) : (
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                                      {instCases.map(c => (
                                        <div
                                          key={c.case_id}
                                          style={{
                                            padding: '8px 12px',
                                            background: '#ffffff',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: 6,
                                            fontSize: 12,
                                            cursor: 'pointer'
                                          }}
                                          onClick={() => openCaseDetails(c.case_id)}
                                        >
                                          <strong>{c.case_reference}</strong> • {c.bureau} •{' '}
                                          <span className={`status-pill ${getStatusClass(c.status)}`} style={{ padding: '2px 6px', fontSize: 10 }}>
                                            {c.status}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ================================================================== */}
        {/* VIEW 5: WORKFLOW HISTORY & AUDIT TRAIL                             */}
        {/* ================================================================== */}
        {activePage === 'Workflow History' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Workflow Audit Trail &amp; Case Timeline</h2>
                <p className="panel-desc">Complete immutable record of all status changes, reassignments, and reviews.</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => loadHistory(historyCaseFilter)}>
                ↻ Refresh History
              </button>
            </div>

            <div className="filter-bar">
              <div className="filter-input-wrap">
                <span className="filter-search-icon">🔍</span>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search history by reference, institution, action, or user..."
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                />
              </div>

              <select
                className="filter-select"
                value={historyCaseFilter}
                onChange={e => setHistoryCaseFilter(e.target.value)}
              >
                <option value="all">All Cases History</option>
                {cases.map(c => (
                  <option key={c.case_id} value={c.case_id}>
                    {c.case_reference} ({c.institution_name.slice(0, 20)}...)
                  </option>
                ))}
              </select>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Case Ref</th>
                    <th>Institution</th>
                    <th>Status Transition</th>
                    <th>Action Taken</th>
                    <th>Acting Officer / User</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map(record => (
                    <tr key={record.history_id}>
                      <td style={{ whiteSpace: 'nowrap', color: '#64748b' }}>
                        {formatDateTime(record.changed_at)}
                      </td>
                      <td>
                        <span className="cell-code" style={{ cursor: 'pointer' }} onClick={() => openCaseDetails(record.case_id)}>
                          {record.case_reference}
                        </span>
                      </td>
                      <td><strong>{record.institution_name}</strong></td>
                      <td>
                        {record.new_status ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="status-pill pill-pending" style={{ padding: '2px 6px', fontSize: 10 }}>
                              {record.previous_status || 'New'}
                            </span>
                            <span>→</span>
                            <span className={`status-pill ${getStatusClass(record.new_status)}`} style={{ padding: '2px 6px', fontSize: 10 }}>
                              {record.new_status}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>Audit Event</span>
                        )}
                      </td>
                      <td>{record.action_taken}</td>
                      <td><strong>{record.changed_by}</strong></td>
                    </tr>
                  ))}
                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: 36 }}>
                        No history records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ================================================================== */}
        {/* VIEW 6: REPORTS & ANALYTICS                                        */}
        {/* ================================================================== */}
        {activePage === 'Reports' && reportsSummary && (
          <>
            <div className="stats-grid">
              <div className="metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Resolution Rate</span>
                  <div className="metric-icon-bubble bubble-emerald">📈</div>
                </div>
                <div className="metric-value">{reportsSummary.totals.resolution_rate}%</div>
                <p className="metric-subtext">Resolved vs Total registered</p>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Overdue Complaints</span>
                  <div className="metric-icon-bubble bubble-rose">⏰</div>
                </div>
                <div className="metric-value" style={{ color: '#b91c1c' }}>
                  {reportsSummary.totals.overdue_cases}
                </div>
                <p className="metric-subtext">Exceeded target due date</p>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">High Priority Active</span>
                  <div className="metric-icon-bubble bubble-amber">⚡</div>
                </div>
                <div className="metric-value">{reportsSummary.totals.high_priority_cases}</div>
                <p className="metric-subtext">Immediate cell attention</p>
              </div>

              <div className="metric-card">
                <div className="metric-card-top">
                  <span className="metric-label">Active Institutions</span>
                  <div className="metric-icon-bubble bubble-blue">🏢</div>
                </div>
                <div className="metric-value">{institutions.length}</div>
                <p className="metric-subtext">Under current oversight</p>
              </div>
            </div>

            {/* Bureau Breakdown Table */}
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Bureau-Wise Complaint Performance</h2>
                  <p className="panel-desc">Comparative analysis across AICTE departments.</p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                  🖨 Print Summary Report
                </button>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Bureau / Cell</th>
                      <th>Total Complaints</th>
                      <th>Pending</th>
                      <th>Under Process</th>
                      <th>Resolved</th>
                      <th>Resolution %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsSummary.by_bureau.map(b => {
                      const resRate = b.total ? Math.round((b.resolved / b.total) * 100) : 0;
                      return (
                        <tr key={b.bureau}>
                          <td><strong className={`bureau-pill ${getBureauClass(b.bureau)}`}>{b.bureau}</strong></td>
                          <td><strong>{b.total}</strong></td>
                          <td><span style={{ color: '#d97706', fontWeight: 600 }}>{b.pending}</span></td>
                          <td><span style={{ color: '#2563eb', fontWeight: 600 }}>{b.underProcess}</span></td>
                          <td><span style={{ color: '#059669', fontWeight: 600 }}>{b.resolved}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${resRate}%`, height: '100%', background: '#059669' }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700 }}>{resRate}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Status & Priority Distribution */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
              <div className="panel">
                <h3 className="panel-title" style={{ marginBottom: 14 }}>Cases by Status</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr><th>Status</th><th>Count</th><th>Share</th></tr>
                    </thead>
                    <tbody>
                      {reportsSummary.by_status.map(s => (
                        <tr key={s.status}>
                          <td><span className={`status-pill ${getStatusClass(s.status)}`}>{s.status}</span></td>
                          <td><strong>{s.count}</strong></td>
                          <td>{s.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <h3 className="panel-title" style={{ marginBottom: 14 }}>Cases by Urgency / Priority</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr><th>Priority</th><th>Count</th><th>Share</th></tr>
                    </thead>
                    <tbody>
                      {reportsSummary.by_priority.map(p => (
                        <tr key={p.priority}>
                          <td><span className={`priority-pill ${getPriorityClass(p.priority)}`}>{p.priority}</span></td>
                          <td><strong>{p.count}</strong></td>
                          <td>{p.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================================================================== */}
        {/* MODAL: CASE DETAILS & REASSIGNMENT                                 */}
        {/* ================================================================== */}
        {selectedCaseDetail && (
          <div className="modal-overlay" onClick={() => setSelectedCaseDetail(null)}>
            <div className="modal-box modal-box-lg" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">Case Details: {selectedCaseDetail.case_reference}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                    Registered on {formatDate(selectedCaseDetail.created_at)}
                  </p>
                </div>
                <button className="modal-close-btn" onClick={() => setSelectedCaseDetail(null)}>✕</button>
              </div>

              <div className="modal-body">
                {/* Institution & Bureau Header */}
                <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: 8, marginBottom: 20, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <strong style={{ fontSize: 15, color: '#0f172a' }}>{selectedCaseDetail.institution_name}</strong>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        Code: {selectedCaseDetail.institution_code} • {selectedCaseDetail.city}, {selectedCaseDetail.state}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span className={`bureau-pill ${getBureauClass(selectedCaseDetail.bureau)}`}>
                        {selectedCaseDetail.bureau}
                      </span>
                      <span className={`priority-pill ${getPriorityClass(selectedCaseDetail.priority)}`}>
                        {selectedCaseDetail.priority}
                      </span>
                      <span className={`status-pill ${getStatusClass(selectedCaseDetail.status)}`}>
                        {selectedCaseDetail.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sibling cases / potential cross-bureau warning */}
                {selectedCaseDetail.related_institution_cases && selectedCaseDetail.related_institution_cases.length > 0 && (
                  <div className="alert-banner alert-info" style={{ marginBottom: 20 }}>
                    <div>
                      <strong>Institution Sibling Complaints ({selectedCaseDetail.related_institution_cases.length}):</strong>
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        {selectedCaseDetail.related_institution_cases.map(sc => (
                          <span key={sc.case_id} style={{ marginRight: 10 }}>
                            {sc.case_reference} ({sc.bureau} - {sc.status})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Complaint Description */}
                <div style={{ marginBottom: 20 }}>
                  <label className="form-label">Category</label>
                  <p style={{ margin: '4px 0 14px', fontSize: 13, fontWeight: 600 }}>{selectedCaseDetail.category}</p>

                  <label className="form-label">Full Complaint Description</label>
                  <div style={{ padding: 14, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
                    {selectedCaseDetail.description}
                  </div>
                </div>

                {/* Meta details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24, fontSize: 12.5 }}>
                  <div>
                    <strong>Assigned Officer:</strong> {selectedCaseDetail.assigned_officer || 'Unassigned'}
                  </div>
                  <div>
                    <strong>Due Date:</strong> {formatDate(selectedCaseDetail.due_date)}
                  </div>
                </div>

                {/* Update Actions Form */}
                <form onSubmit={handleUpdateCaseDetails} style={{ padding: '16px 18px', background: '#f1f5f9', borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 24 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13.5, color: '#0f172a' }}>Update Case / Reassign</h4>
                  <div className="form-grid">
                    {isAdmin && (
                      <div className="form-group">
                        <label className="form-label">Reassign Bureau / Cell</label>
                        <select name="bureau" className="form-control" defaultValue={selectedCaseDetail.bureau}>
                          <option value="PGRC">PGRC</option>
                          <option value="Regulation Bureau">Regulation Bureau</option>
                          <option value="Approval Bureau">Approval Bureau</option>
                          <option value="Finance Cell">Finance Cell</option>
                          <option value="Other Cell">Other Cell</option>
                        </select>
                      </div>
                    )}

                    {isAdmin && (
                      <div className="form-group">
                        <label className="form-label">Case Priority</label>
                        <select name="priority" className="form-control" defaultValue={selectedCaseDetail.priority}>
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Change Status</label>
                      <select name="status" className="form-control" defaultValue={selectedCaseDetail.status}>
                        <option value="Pending">Pending</option>
                        <option value="Under Process">Under Process</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Update Action Notes</label>
                      <input name="notes" className="form-control" placeholder="Brief reason for change..." />
                    </div>

                    <div className="form-full" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <button type="submit" className="btn btn-primary btn-sm">
                        Save Updates
                      </button>
                    </div>
                  </div>
                </form>

                {/* Case Chronological Audit Trail */}
                <h4 style={{ margin: '0 0 10px', fontSize: 13.5, color: '#0f172a' }}>Case History Timeline</h4>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date &amp; Time</th>
                        <th>Action</th>
                        <th>Transition</th>
                        <th>Officer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCaseDetail.history || []).map(h => (
                        <tr key={h.history_id}>
                          <td style={{ fontSize: 11.5, color: '#64748b' }}>{formatDateTime(h.changed_at)}</td>
                          <td>{h.action_taken}</td>
                          <td>
                            {h.new_status ? (
                              <span className={`status-pill ${getStatusClass(h.new_status)}`} style={{ padding: '2px 6px', fontSize: 10 }}>
                                {h.new_status}
                              </span>
                            ) : '—'}
                          </td>
                          <td>{h.changed_by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedCaseDetail(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* MODAL: OVERLAP ALERT REVIEW DIALOG                                 */}
        {/* ================================================================== */}
        {reviewModalInst && (
          <div className="modal-overlay" onClick={() => setReviewModalInst(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">Review Cross-Bureau Overlap</h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{reviewModalInst.institution_name}</p>
                </div>
                <button className="modal-close-btn" onClick={() => setReviewModalInst(null)}>✕</button>
              </div>

              <form onSubmit={handleReviewSubmit}>
                <div className="modal-body">
                  <p style={{ fontSize: 13, color: '#334155', marginBottom: 14 }}>
                    This institution has <strong>{reviewModalInst.case_count} cases</strong> across{' '}
                    <strong>{reviewModalInst.bureau_count} distinct bureaus</strong> ({reviewModalInst.distinct_bureaus.join(', ')}).
                  </p>

                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label">Review Action</label>
                    <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}>
                      Action: Change review status to{' '}
                      <strong>
                        {reviewModalInst.review_status === 'Reviewed' ? 'Pending Review (Reopen)' : 'Reviewed'}
                      </strong>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Review Notes / Meeting Minutes</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="e.g. Scheduled cross-bureau coordination meeting with PGRC and Regulation chiefs..."
                      value={reviewNote}
                      onChange={e => setReviewNote(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setReviewModalInst(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={reviewLoading}>
                    {reviewLoading ? 'Submitting...' : 'Confirm & Save to Audit Log'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* MODAL: CREATE CASE                                                 */}
        {/* ================================================================== */}
        {showCreateCaseModal && (
          <div className="modal-overlay" onClick={() => setShowCreateCaseModal(false)}>
            <div className="modal-box modal-box-lg" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Create New Institution Complaint Case</h3>
                <button className="modal-close-btn" onClick={() => setShowCreateCaseModal(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateCase}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group form-full">
                      <label className="form-label">Institution *</label>
                      <select
                        className="form-control"
                        value={caseForm.institution_id}
                        onChange={e => setCaseForm({ ...caseForm, institution_id: e.target.value })}
                        required
                      >
                        <option value="">Select Target Institution</option>
                        {institutions.map(inst => (
                          <option key={inst.institution_id} value={inst.institution_id}>
                            {inst.institution_name} ({inst.institution_code}) - {inst.state}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">AICTE Bureau / Cell *</label>
                      <select
                        className="form-control"
                        value={caseForm.bureau}
                        onChange={e => setCaseForm({ ...caseForm, bureau: e.target.value })}
                        required
                      >
                        <option value="PGRC">PGRC (Public Grievance Redressal Cell)</option>
                        <option value="Regulation Bureau">Regulation Bureau</option>
                        <option value="Approval Bureau">Approval Bureau</option>
                        <option value="Finance Cell">Finance Cell</option>
                        <option value="Other Cell">Other Cell</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Priority *</label>
                      <select
                        className="form-control"
                        value={caseForm.priority}
                        onChange={e => setCaseForm({ ...caseForm, priority: e.target.value })}
                        required
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>

                    <div className="form-group form-full">
                      <label className="form-label">Complaint Category *</label>
                      <input
                        className="form-control"
                        placeholder="e.g. Faculty Salary Grievance, Capitation Fee, Norms Violation"
                        value={caseForm.category}
                        onChange={e => setCaseForm({ ...caseForm, category: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group form-full">
                      <label className="form-label">Complaint Description *</label>
                      <textarea
                        className="form-control"
                        placeholder="Detailed particulars of the complaint case..."
                        value={caseForm.description}
                        onChange={e => setCaseForm({ ...caseForm, description: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Assigned Officer</label>
                      <input
                        className="form-control"
                        placeholder="e.g. Smt. Priya Verma (PGRC)"
                        value={caseForm.assigned_officer}
                        onChange={e => setCaseForm({ ...caseForm, assigned_officer: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Target Due Date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={caseForm.due_date}
                        onChange={e => setCaseForm({ ...caseForm, due_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateCaseModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingCase}>
                    {savingCase ? 'Registering...' : 'Register Complaint Case'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* MODAL: CREATE INSTITUTION                                          */}
        {/* ================================================================== */}
        {showCreateInstModal && (
          <div className="modal-overlay" onClick={() => setShowCreateInstModal(false)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Register New Institution</h3>
                <button className="modal-close-btn" onClick={() => setShowCreateInstModal(false)}>✕</button>
              </div>

              <form onSubmit={handleCreateInst}>
                <div className="modal-body">
                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label className="form-label">Institution Name *</label>
                    <input
                      className="form-control"
                      placeholder="e.g. Pune Institute of Computer Technology"
                      value={instForm.institution_name}
                      onChange={e => setInstForm({ ...instForm, institution_name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-grid" style={{ marginBottom: 14 }}>
                    <div className="form-group">
                      <label className="form-label">Institution Code</label>
                      <input
                        className="form-control"
                        placeholder="e.g. AICTE-INST-1007"
                        value={instForm.institution_code}
                        onChange={e => setInstForm({ ...instForm, institution_code: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">State *</label>
                      <input
                        className="form-control"
                        placeholder="e.g. Maharashtra"
                        value={instForm.state}
                        onChange={e => setInstForm({ ...instForm, state: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">City *</label>
                      <input
                        className="form-control"
                        placeholder="e.g. Pune"
                        value={instForm.city}
                        onChange={e => setInstForm({ ...instForm, city: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Contact Email</label>
                      <input
                        type="email"
                        className="form-control"
                        placeholder="e.g. principal@college.edu"
                        value={instForm.contact_email}
                        onChange={e => setInstForm({ ...instForm, contact_email: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Campus Address</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="Campus survey no., area, pin code..."
                      value={instForm.address}
                      onChange={e => setInstForm({ ...instForm, address: e.target.value })}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateInstModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingInst}>
                    {savingInst ? 'Saving...' : 'Register Institution'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
