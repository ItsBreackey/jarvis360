# Quick script to POST to register and login endpoints using Django test client
import os, sys
PROJECT_ROOT = r"D:\BrandStuff\BreackeyPortfolio\ProjectTracker\jarvis360"
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
os.environ.setdefault('DJANGO_SETTINGS_MODULE','jarvis360.settings')
import django
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model

c = Client(HTTP_HOST='127.0.0.1')
username = 'debuguser'
password = 'debugpw'
email = 'debuguser@example.com'
org_name = 'DebugOrg'

print('Registering...')
resp = c.post('/api/register/', {'username': username, 'password': password, 'email': email, 'org_name': org_name}, content_type='application/json', SERVER_NAME='127.0.0.1')
print('status:', resp.status_code)
print('body:', resp.content)

print('\nLogging in...')
resp2 = c.post('/api/login-cookie/', {'username': username, 'password': password}, content_type='application/json', SERVER_NAME='127.0.0.1')
print('status:', resp2.status_code)
print('body:', resp2.content)
print('cookies:', resp2.cookies)
