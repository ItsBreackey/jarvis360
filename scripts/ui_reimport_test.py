"""
Simple HTTP test that:
- registers a user
- logs in via cookie (login-cookie)
- uploads a small CSV to /api/uploads/
- calls POST /api/uploads/<id>/reimport/

Run while Django dev server is running on http://127.0.0.1:8000
"""
import time
import sys
import requests

BASE = 'http://127.0.0.1:8000'

username = f'test_ui_user_{int(time.time())}'
password = 'testpass123'
email = f'{username}@example.com'
org_name = f'UIOrg{int(time.time())}'

s = requests.Session()

try:
    print('Registering user...')
    r = s.post(BASE + '/api/register/', json={'username': username, 'password': password, 'email': email, 'org_name': org_name}, timeout=10)
    print('register:', r.status_code, r.text[:400])
except Exception as e:
    print('Register failed:', e)
    sys.exit(1)

try:
    print('Logging in (cookie)...')
    r = s.post(BASE + '/api/login-cookie/', json={'username': username, 'password': password}, timeout=10)
    print('login-cookie:', r.status_code, r.text[:400])
    # show cookies
    print('cookies:', s.cookies.get_dict())
except Exception as e:
    print('Login failed:', e)
    sys.exit(1)

# upload a small CSV
csv_text = 'id,MRR,signup_date\nui_cust,42,2024-01-01\n'
files = {'file': ('test.csv', csv_text, 'text/csv')}

try:
    print('Uploading CSV...')
    r = s.post(BASE + '/api/uploads/', files=files, timeout=20)
    print('upload resp:', r.status_code)
    try:
        data = r.json()
    except Exception:
        data = None
    print('upload body snippet:', (r.text or '')[:800])
    if not data or not data.get('id'):
        print('Upload did not return an id; aborting.')
        sys.exit(1)
    upload_id = data.get('id')
    print('created upload id=', upload_id)
except Exception as e:
    print('Upload failed:', e)
    sys.exit(1)

# call reimport
try:
    print('Calling reimport...')
    r = s.post(f"{BASE}/api/uploads/{upload_id}/reimport/", timeout=20)
    print('reimport status:', r.status_code)
    print('reimport headers Retry-After:', r.headers.get('Retry-After'))
    print('reimport body:', (r.text or '')[:1200])
except Exception as e:
    print('Reimport failed:', e)
    sys.exit(1)

print('Done.')
