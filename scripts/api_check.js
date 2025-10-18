// Simple API check script to validate token-auth and dashboard create/list
// Usage: node scripts/api_check.js [API_BASE] [username] [password]

const fetch = require('node-fetch');
const API_BASE = process.argv[2] || 'http://127.0.0.1:8000';
const username = process.argv[3] || 'e2e_test_user';
const password = process.argv[4] || 'TestPass123!';

(async () => {
  try {
    console.log('API base:', API_BASE);
    // authenticate via token-auth
    const authResp = await fetch(`${API_BASE}/api/token-auth/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    console.log('token-auth status=', authResp.status);
    const authBody = await authResp.text();
    console.log('token-auth body=', authBody);
    let token = null;
    try { const parsed = JSON.parse(authBody); token = parsed && (parsed.token || parsed.key || parsed.access); } catch (e) {}
    if (!token) {
      console.error('No token found in token-auth response; aborting');
      process.exit(2);
    }

    // create dashboard
    const createResp = await fetch(`${API_BASE}/api/dashboards/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
      body: JSON.stringify({ name: 'API check - temp', config: { data: { checked: true } } })
    });
    console.log('create status=', createResp.status);
    console.log('create body=', await createResp.text());

    // list dashboards
    const listResp = await fetch(`${API_BASE}/api/dashboards/`, { headers: { Authorization: `Token ${token}` } });
    console.log('list status=', listResp.status);
    console.log('list body=', await listResp.text());

    process.exit(0);
  } catch (e) {
    console.error('Error in api_check', e);
    process.exit(1);
  }
})();
