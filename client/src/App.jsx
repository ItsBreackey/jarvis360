import './App.css';



import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Link, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import logo from './d2m_logo.png';
import Toast from './components/Toast';
import { computeMonthlySeries as computeMonthlySeriesUtil } from './utils/analytics';
import { parseCSV } from './utils/csv';
// recharts imports moved to individual pages
import WhatIfSimulation from './pages/WhatIfSimulation';
import DataOverview from './pages/DataOverview';
import TimeSeriesForecast from './pages/TimeSeriesForecast';
import DataDashboard from './pages/DataDashboard';
import ArrView from './pages/ArrView';
import ChurnPredictor from './pages/ChurnPredictor';
import Settings from './pages/Settings';
import Automations from './pages/Automations';
import { calculateChurnRiskScore } from './lib/appShared';
import DebugHelpers from './components/DebugHelpers';

// Minimal ErrorBoundary in-app to avoid adding new file dependency
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(err) { return { hasError: true, error: err }; }
  componentDidCatch(error, info) { console.error('ErrorBoundary caught', error, info); }
  render() { if (this.state.hasError) return (<div className="p-6 bg-red-50 text-red-800">An error occurred: {String(this.state.error)}</div>); return this.props.children; }
}

// Cohort utilities and CSV helpers (previously used by standalone ARR page)
// The DataDashboard / CSV intake UI has been moved to `client/src/pages/DataDashboard.jsx`.
// The inline implementation was removed from App.jsx to keep App as a lightweight orchestrator.

// Small AuthPanel to show status and route to full auth pages

const AuthPanel = ({ showToast = null }) => {
  const { user, logout } = useAuth();

  const doLogout = async () => {
    await logout();
    (showToast || (()=>{}))('Logged out.', 'info');
  };

  if (user) {
    return (
      <div className="flex items-center space-x-2">
        <div className="text-xs text-gray-600">{user ? `Signed in as ${user.username || user}` : `Signed in`}</div>
        <button className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded" onClick={doLogout}>Logout</button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Link to="/login" className="text-xs text-blue-600">Sign in</Link>
      <Link to="/register" className="text-xs text-blue-600">Create account</Link>
    </div>
  );
};

// Use computeMonthlySeries from utilities
const computeMonthlySeries = computeMonthlySeriesUtil;


// DataOverview extracted to pages/DataOverview.jsx

// TimeSeriesForecast implementation moved to `client/src/pages/TimeSeriesForecast.jsx`.
// Inline implementation removed to avoid duplicate identifier and to use the extracted page component.

// ArrView has been extracted to `client/src/pages/ArrView.jsx`

// (Named exports consolidated at the end of the file)

// WhatIfSimulation will be exported after its definition further down




// ChurnPredictor extracted to pages/ChurnPredictor.jsx


// Settings extracted to pages/Settings.jsx

// NoDataMessage provided by ./lib/appShared.js


// --- Main App Component ---

const App = () => {
  const [view, setView] = useState('dashboard'); 
  const [customers, setCustomers] = useState([]);
  // E2E test hook: allow pre-seeding customers via localStorage key 'jarvis_e2e_seed'
  useEffect(() => {
    try {
      const rawSeed = localStorage.getItem('jarvis_e2e_seed');
      if (rawSeed) {
        const parsed = JSON.parse(rawSeed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // normalize seeded customers and mark churn provenance
          const normalized = parsed.map(c => ({ ...c, _churnProvided: !!(c.churnProbability || c.churnProbability === 0) }));
          setCustomers((prev) => {
            // idempotent: if prev already contains same number of customers with matching ids, skip re-setting
            try {
              if (Array.isArray(prev) && prev.length === normalized.length) {
                const prevIds = new Set(prev.map(p => p && p.id));
                const normIds = new Set(normalized.map(n => n && n.id));
                if (prevIds.size === normIds.size && [...normIds].every(i => prevIds.has(i))) {
                  console.debug('Pre-seed found but already applied; skipping setCustomers');
                  return prev;
                }
              }
            } catch (e) { /* ignore */ }
            console.debug('Applying pre-seed customers from localStorage (jarvis_e2e_seed)', normalized.length);
            return normalized;
          });
        }
        localStorage.removeItem('jarvis_e2e_seed');
      }
    } catch (e) { /* ignore */ }
  }, []);
  // modal state removed; use toasts instead

  // Toast state: array of { id, message, type }
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((message, type = 'info', timeout = 3500) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2,6);
    setToasts((t) => [{ id, message, type, timeout }].concat(t).slice(0,6));
    return id;
  }, []);
  const removeToast = useCallback((id) => setToasts((t) => t.filter(x => x.id !== id)), []);
  // Chart refs for reliable exports
  const forecastChartRef = useRef(null);
  const simulationChartRef = useRef(null);

  const showToast = useCallback((message, type = 'info', timeout = 3500) => {
    pushToast(message, type, timeout);
  }, [pushToast]);

  // Legacy showCustomModal now routes to non-blocking toast (keeps API compatible)
  const showCustomModal = useCallback((message, type = 'info', timeout = 3500) => {
    showToast(message, type, timeout);
  }, [showToast]);

  // Provide stable refs to the toast/modal functions so deeply nested effects
  // (like TimeSeriesForecast) can call them without needing to include them
  // in dependency lists which can cause identity churn.
  const showToastRef = useRef(showToast);
  const showCustomModalRef = useRef(showCustomModal);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  useEffect(() => { showCustomModalRef.current = showCustomModal; }, [showCustomModal]);

  // Listen for cross-component notification events and show toasts using stable refs
  useEffect(() => {
    const onNotify = (e) => {
      try {
        const d = e && e.detail ? e.detail : { message: String(e && e.detail) };
        const fn = (showToastRef && showToastRef.current) || (showCustomModalRef && showCustomModalRef.current) || (()=>{});
        fn(d.message || 'Notification', d.type || 'info');
      } catch (err) { /* ignore */ }
    };
    window.addEventListener('jarvis:notify', onNotify);
    return () => window.removeEventListener('jarvis:notify', onNotify);
  }, []);

  // If we were navigated here from a share link in another tab, ensure we
  // navigate to the Scenarios view so the WhatIfSimulation component mounts and
  // can consume the autoload marker; also listen for shared-scenario events
  // and storage changes to react to cross-tab/share actions.
  useEffect(() => {
    try {
      const autoloadId = localStorage.getItem('jarvis_autoload_scenario');
      if (autoloadId) setView('simulation');
    } catch (e) { /* ignore */ }

    const handleShared = () => setView('simulation');
    const handleStorage = (ev) => { if (ev && ev.key === 'jarvis_autoload_scenario' && ev.newValue) setView('simulation'); };
    window.addEventListener('jarvis:shared-scenario', handleShared);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('jarvis:shared-scenario', handleShared);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // notify helper removed (unused) — use showToast directly via refs where needed

  // Handler to receive uploaded data (memoized to avoid identity churn)
  const handleDataUpload = useCallback((newCustomers) => {
    setCustomers(newCustomers);
  }, [setCustomers]);

  // Function to seed initial dummy data
  const seedInitialData = useCallback(() => {
    const dummyCustomers = [
      { id: 'd1', name: 'Northbridge Systems', MRR: 4200, churnProbability: 0.12, supportTickets: 1, lastActivityDays: 5, contractLengthMonths: 12, isContacted: false },
      { id: 'd2', name: 'Atlas Financial', MRR: 12500, churnProbability: 0.05, supportTickets: 0, lastActivityDays: 2, contractLengthMonths: 24, isContacted: false },
      { id: 'd3', name: 'Horizon HealthTech', MRR: 3200, churnProbability: 0.28, supportTickets: 3, lastActivityDays: 18, contractLengthMonths: 12, isContacted: false },
      { id: 'd4', name: 'Vertex Logistics', MRR: 900, churnProbability: 0.62, supportTickets: 5, lastActivityDays: 40, contractLengthMonths: 6, isContacted: false },
      { id: 'd5', name: 'Aurora Retail', MRR: 2400, churnProbability: 0.18, supportTickets: 2, lastActivityDays: 7, contractLengthMonths: 12, isContacted: false },
      { id: 'd6', name: 'Stratus AI', MRR: 7800, churnProbability: 0.09, supportTickets: 0, lastActivityDays: 1, contractLengthMonths: 36, isContacted: false },
      { id: 'd7', name: 'Bluewater Media', MRR: 600, churnProbability: 0.55, supportTickets: 2, lastActivityDays: 30, contractLengthMonths: 12, isContacted: false },
    ];
    // ensure seeded customers include churn provenance where churnProbability is provided
    const seeded = dummyCustomers.map(c => ({ ...c, _churnProvided: !!(c.churnProbability || c.churnProbability === 0) }));
    setCustomers(seeded);
    try { (showToast || showCustomModal)(`Successfully added ${dummyCustomers.length} initial customers to memory!`, 'success'); } catch (e) { console.debug('seedInitialData toast failed', e); }
    // helpful debug output for E2E runs
    try { if (typeof console !== 'undefined' && console.info) console.info('seedInitialData: seeded', seeded.length); } catch (e) {}
  }, [setCustomers, showCustomModal, showToast]);

  // Handler to load demo dataset (used by onboarding 'Load Demo' button)
  const handleLoadDemo = useCallback(async () => {
    try { localStorage.setItem('jarvis_onboard_shown_v1', '1'); } catch (e) { /* ignore */ }
    try { setShowOnboard(false); } catch (e) { /* ignore */ }
    try { setView('dashboard'); } catch (e) {}
    try {
      const resp = await fetch('/demo_sample.csv');
      const txt = await resp.text();
      const parsed = parseCSV(txt, { dateKey: 'date', mrrKey: 'MRR', idKey: 'name' });
      if (parsed && parsed.length) {
        handleDataUpload(parsed);
        (showToast || showCustomModal)(`Loaded demo dataset (${parsed.length} rows)`, 'success');
        return;
      }
      (showToast || showCustomModal)('Demo data failed to parse.', 'error');
    } catch (e) {
      console.error('Load demo failed', e);
      // Fallback: seed local dummy data (works in test/jsdom environments)
      try {
        seedInitialData();
        (showToast || showCustomModal)('Loaded demo dataset (fallback seed).', 'info');
      } catch (se) {
        console.error('Fallback seed failed', se);
        (showToast || showCustomModal)('Failed to load demo data.', 'error');
      }
    }
  }, [setView, handleDataUpload, seedInitialData, showToast, showCustomModal]);

  // Expose seed function to window for E2E tests to allow deterministic seeding
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        // always expose seedInitialData for E2E tests; make it safe to call repeatedly
        Object.defineProperty(window, 'seedInitialData', {
          configurable: true,
          enumerable: false,
          value: function() {
            try { return seedInitialData(); } catch (e) { console.error('window.seedInitialData failed', e); }
          }
        });
      }
    } catch (e) {}
    return () => {
      try { if (typeof window !== 'undefined' && window.seedInitialData) delete window.seedInitialData; } catch (e) {}
    };
  }, [seedInitialData]);

  // Toggle: compute churn heuristics for rows that did not provide churnProbability
  const [computeChurnWhenMissing, setComputeChurnWhenMissing] = useState(true);
  // churn estimator (require to keep module resolution simple in CRA tests)
  // we use the detailed estimator export from utils/churn
  const estimateChurnFromFeaturesDetailed = require('./utils/churn').default; // detailed

  // Calculate enhanced customer list (including risk score) whenever the raw customer list changes
  const enhancedCustomers = useMemo(() => {
    return customers.map(c => {
      // If churn was not provided and user wants heuristics, compute from riskScore heuristically after riskScore calculation
      const riskScore = calculateChurnRiskScore(c);
      const riskLevel = riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low';
      const base = {
        ...c,
        riskScore,
        riskLevel,
      };

      // churn provenance flags: supplied (_churnProvided) vs computed (_churnComputed)
      let churnProvided = !!c._churnProvided;
      let churnComputed = false;

  // Compute churn when the user enabled heuristics AND either the CSV didn't provide churn
  // or the churn value is missing/zero. This makes the toggle more robust to uploads
  // where the churn column may be present but cells are empty/zero.
  if (computeChurnWhenMissing && (!churnProvided || !c.churnProbability || Number(c.churnProbability) === 0)) {
        // try estimator using supportTickets / lastActivityDays / MRR
        try {
          // load persisted weights from Settings (if any)
          let weights = null;
          try { const raw = localStorage.getItem('jarvis_churn_weights_v1'); if (raw) weights = JSON.parse(raw); } catch (e) { weights = null; }
          const res = estimateChurnFromFeaturesDetailed(c, weights || undefined);
          // estimator returns { estimate, contributions, mainDriver, raw }
          base.churnProbability = Math.max(0, Math.min(1, Number(res?.estimate) || 0));
          // attach explainability info for UI
          base._churnDriver = res?.mainDriver ? (res.mainDriver.label || res.mainDriver.key) : null;
          base._churnContributions = res?.contributions || null;
          churnComputed = true;
        } catch (e) {
          // fallback to riskScore heuristic
          const v = Math.min(1, Math.max(0, riskScore / 100));
          base.churnProbability = v;
          base._churnDriver = null;
          base._churnContributions = null;
          churnComputed = true;
        }
      }

      base._churnProvided = churnProvided;
      base._churnComputed = churnComputed;

      return base;
    }).sort((a, b) => b.riskScore - a.riskScore); // Sort by highest risk
  }, [customers, computeChurnWhenMissing, estimateChurnFromFeaturesDetailed]);

  // When the user enables/disables the heuristic toggle, apply or revert computed churn into
  // the canonical `customers` state so Overview/Forecast views (which read `customers`) reflect it.
  useEffect(() => {
    // avoid running until estimator is available
    if (!estimateChurnFromFeaturesDetailed) return;

    if (computeChurnWhenMissing) {
      // compute for rows that did not provide churn and aren't already computed
      const weightsRaw = (() => { try { const raw = localStorage.getItem('jarvis_churn_weights_v1'); return raw ? JSON.parse(raw) : null;} catch (e) { return null; } })();
      const updated = customers.map(c => {
        const provided = !!c._churnProvided;
        const hasChurn = c.churnProbability !== undefined && Number(c.churnProbability) !== 0;
        if (!provided && !hasChurn && !c._churnComputed) {
          try {
            const res = estimateChurnFromFeaturesDetailed(c, weightsRaw || undefined);
            return { ...c, _prevChurn: c.churnProbability, churnProbability: Math.max(0, Math.min(1, Number(res?.estimate) || 0)), _churnComputed: true, _churnDriver: res?.mainDriver ? (res.mainDriver.label || res.mainDriver.key) : null, _churnContributions: res?.contributions || null };
          } catch (e) {
            const fallback = Math.min(1, Math.max(0, calculateChurnRiskScore(c) / 100));
            return { ...c, _prevChurn: c.churnProbability, churnProbability: fallback, _churnComputed: true };
          }
        }
        return c;
      });
      // only set when something changed
      const changed = updated.some((u, i) => u !== customers[i]);
      if (changed) setCustomers(updated);
    } else {
      // revert computed churns back to previous values when toggle is disabled
      const reverted = customers.map(c => {
        if (c._churnComputed) {
          const nc = { ...c };
          if (nc._prevChurn !== undefined) {
            nc.churnProbability = nc._prevChurn;
          }
          delete nc._prevChurn;
          delete nc._churnComputed;
          delete nc._churnDriver;
          delete nc._churnContributions;
          return nc;
        }
        return c;
      });
      const changed = reverted.some((u, i) => u !== customers[i]);
      if (changed) setCustomers(reverted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeChurnWhenMissing, customers]);

  // Handler to mark customer as contacted
  const handleContactCustomer = useCallback((customerId) => {
    setCustomers(prevCustomers => 
        prevCustomers.map(c => 
            c.id === customerId ? { ...c, isContacted: true } : c
        )
    );
    (showToast || showCustomModal)("Customer marked as contacted! (Local update)", 'info');
  }, [setCustomers, showCustomModal, showToast]);


  // Calculate Overview Data based on current customers
  const overviewData = useMemo(() => {
    let totalMRR = 0;
    let customerCount = 0;
  // Basic aggregations
  customers.forEach(data => {
    totalMRR += Number(data.MRR) || 0;
    customerCount += 1;
  });

  const avgMrr = customerCount > 0 ? totalMRR / customerCount : 0;
  const totalRevenue = totalMRR * 12; // Annualized

  // Heuristic churn and NRR estimates (best-effort without event history)
  // We approximate 'at-risk' customers as churnProbability >= 0.5
  const atRiskCustomers = customers.filter(c => Number(c.churnProbability) >= 0.5);
  const churnedMRR = atRiskCustomers.reduce((s, c) => s + (Number(c.MRR) || 0), 0);
  const churnRateByCount = customerCount > 0 ? (atRiskCustomers.length / customerCount) : 0;

  // Estimated expansion MRR heuristic: customers with churnProbability < 0.2 are 'expanding' slightly
  const expansionCustomers = customers.filter(c => Number(c.churnProbability) < 0.2);
  const expansionMRR = expansionCustomers.reduce((s, c) => s + ((Number(c.MRR) || 0) * 0.02), 0); // assume 2% expansion

  // NRR estimate: (startingMRR + expansion - churn) / startingMRR
  const estimatedNRR = totalMRR > 0 ? ((totalMRR + expansionMRR - churnedMRR) / Math.max(1, totalMRR)) : 1;

  const monthlySeries = computeMonthlySeries(customers);

  return {
    customerCount,
    totalMRR,
    avgMrr,
    totalRevenue,
    churnedMRR,
    churnRateByCount,
    expansionMRR,
    estimatedNRR,
    monthlySeries,
  };
  }, [customers]);

  // Prepare a lightweight records shape for ARR cohort utilities
  const arrRecords = useMemo(() => {
    return (customers || []).map(c => ({
      customer_id: c.id || c.name || c.customer_id || c.id_str || null,
      mrr: Number(c.MRR || c.mrr || c.monthly_revenue || 0) || 0,
      signup_date: c.signup_date || c.date || c.start_date || c.created_at || null,
    }));
  }, [customers]);

  // Onboarding modal (show once)
  const [showOnboard, setShowOnboard] = useState(() => {
    try { return !localStorage.getItem('jarvis_onboard_shown_v1'); } catch (e) { return true; }
  });

  // Router sync: keep internal `view` state in sync with pathname for automations deep-linking
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    try {
      const p = location && location.pathname ? location.pathname : '';
      if (p.startsWith('/automations')) {
        setView('automations');
      }
    } catch (e) { /* ignore */ }
  }, [location]);
  const dismissOnboard = useCallback(() => {
    try { localStorage.setItem('jarvis_onboard_shown_v1', '1'); } catch (e) {}
    setShowOnboard(false);
  }, []);


  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <DataDashboard onDataUpload={handleDataUpload} showCustomModal={showCustomModal} seedInitialData={seedInitialData} showToast={showToast} />;
      case 'overview':
        return <DataOverview overviewData={overviewData} />;
      case 'forecast':
        return <TimeSeriesForecast chartRef={forecastChartRef} monthlySeries={overviewData.monthlySeries} showCustomModal={showCustomModal} showToast={showToast} showToastRef={showToastRef} showCustomModalRef={showCustomModalRef} />;
      case 'simulation':
        return <WhatIfSimulation enhancedCustomers={enhancedCustomers} showCustomModal={showCustomModal} chartRef={simulationChartRef} showToast={showToast} />;
      case 'arr':
        return <ArrView records={arrRecords} />;
      case 'churn':
        return <ChurnPredictor enhancedCustomers={enhancedCustomers} handleContactCustomer={handleContactCustomer} seedInitialData={seedInitialData} computeChurnWhenMissing={computeChurnWhenMissing} setComputeChurnWhenMissing={setComputeChurnWhenMissing} />;
      case 'settings':
        return <Settings />;
      case 'automations':
        return <Automations />;
      default:
        return <DataDashboard onDataUpload={handleDataUpload} showCustomModal={showCustomModal} seedInitialData={seedInitialData} />;
    }
  };

  const navItemClass = (currentView) => (
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors duration-150 ${
      view === currentView
        ? 'bg-white text-blue-700 border-b-2 border-blue-700 font-semibold'
        : 'text-gray-500 hover:text-blue-600 hover:bg-gray-100'
    }`
  );

  return (
  <div className="min-h-screen bg-gray-50 antialiased">
      
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row justify-between items-center">
      <div className="flex items-center space-x-3">
        <img src={logo} alt="jArvIs360 by Data2Metrics" className="h-10 w-10 object-contain" />
        <div>
          <div className="text-xs text-gray-500">Data2Metrics</div>
          <h1 className="text-2xl font-extrabold text-gray-900">jArvIs360 SaaS</h1>
        </div>
      </div>
          <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800`}>
                Local Memory Mode
              </span>
              <AuthPanel showToast={showToast} />
            </div>
        </div>
      </header>
      {showOnboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h2 className="text-2xl font-bold mb-2">Welcome to Jarvis360</h2>
            <p className="text-gray-600 mb-4">Quickly upload a CSV or load the demo data to see MRR forecasting, churn risk, and run what-if simulations — no setup required.</p>
            <div className="flex justify-end space-x-2">
              <button className="px-4 py-2 rounded text-sm bg-gray-100" onClick={dismissOnboard}>Dismiss</button>
              <button className="px-4 py-2 rounded text-sm bg-blue-600 text-white" onClick={handleLoadDemo}>Load Demo</button>
            </div>
          </div>
        </div>
      )}

  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Tabs */}
        <nav className="flex space-x-1 mt-4 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
            <button type="button" aria-label="Go to Data Intake" onClick={() => setView('dashboard')} className={navItemClass('dashboard')}>
            Data Intake
          </button>
          <button type="button" aria-label="Go to Overview" onClick={() => setView('overview')} className={navItemClass('overview')}>
            Overview
          </button>
          <button type="button" aria-label="Go to Forecasting" onClick={() => setView('forecast')} className={navItemClass('forecast')}>
            Forecasting
          </button>
          <button type="button" aria-label="Go to Scenarios" onClick={() => setView('simulation')} className={navItemClass('simulation')}>
            Scenarios
          </button>
          <button type="button" aria-label="Go to ARR" onClick={() => setView('arr')} className={navItemClass('arr')}>
            ARR
          </button>
          <button type="button" aria-label="Go to Risk & Actions" onClick={() => setView('churn')} className={navItemClass('churn')}>
            Risk & Actions
          </button>
          <button type="button" aria-label="Go to Administration" onClick={() => setView('settings')} className={navItemClass('settings')}>
            Administration
          </button>
          <button type="button" aria-label="Go to Automations" onClick={() => { navigate('/automations'); setView('automations'); }} className={navItemClass('automations')}>
            Automations
          </button>
        </nav>
        
        {/* Content Area */}
        <main className="py-6 min-h-[70vh]">
          <Routes>
              <Route path="/*" element={renderView()} />
              <Route path="/automations" element={<Automations />} />
          </Routes>
        </main>
      </div>
      
      {/* Toast container (bottom-right) */}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex flex-col-reverse space-y-reverse space-y-2 w-80">
        {toasts.map(t => (
          <div key={t.id} className="mb-2">
            <Toast id={t.id} message={t.message} type={t.type} duration={t.timeout} onClose={removeToast} />
          </div>
        ))}
      </div>

      {/* Developer debug helpers (shows last server response snapshot) */}
      <DebugHelpers />

  {/* CustomModal removed; toasts used instead */}
    </div>
  );
};

// wrap export in ErrorBoundary so we see errors instead of a blank screen
const WrappedApp = (props) => (
  <ErrorBoundary>
    <App {...props} />
  </ErrorBoundary>
);

export default WrappedApp;

// Named export WhatIfSimulation for tests
export { WhatIfSimulation };

// Also export other page-level components for external imports
export { DataDashboard, DataOverview, TimeSeriesForecast, ArrView, ChurnPredictor, Settings, Automations };
