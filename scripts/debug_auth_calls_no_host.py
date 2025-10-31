# Quick script to POST to register and login endpoints using Django test client (no custom host)
import os, sys
PROJECT_ROOT = r"D:\BrandStuff\BreackeyPortfolio\ProjectTracker\jarvis360"
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
os.environ.setdefault('DJANGO_SETTINGS_MODULE','jarvis360.settings')
import django
django.setup()

from django.test import Client

c = Client()
username = 'debuguser2'
password = 'debugpw2'
email = 'debuguser2@example.com'
org_name = 'DebugOrg2'

print('Registering...')
resp = c.post('/api/register/', {'username': username, 'password': password, 'email': email, 'org_name': org_name}, content_type='application/json')
print('status:', resp.status_code)
print('body:', resp.content)

print('\nLogging in...')
resp2 = c.post('/api/login-cookie/', {'username': username, 'password': password}, content_type='application/json')
print('status:', resp2.status_code)
print('body:', resp2.content)
print('cookies:', resp2.cookies)
