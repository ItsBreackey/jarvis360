# Quick script to verify Django settings import/load (and that django-environ warnings are silenced)
import sys, os
PROJECT_ROOT = r"D:\BrandStuff\BreackeyPortfolio\ProjectTracker\jarvis360"
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
os.environ.setdefault('DJANGO_SETTINGS_MODULE','jarvis360.settings')
try:
    import django
    django.setup()
    print('DJANGO OK')
except Exception as e:
    print('DJANGO IMPORT ERROR:', type(e), e)
