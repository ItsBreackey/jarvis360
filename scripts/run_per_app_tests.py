import os
import sys
import subprocess
import inspect
import importlib

root = os.path.abspath(r'D:\BrandStuff\BreackeyPortfolio\ProjectTracker\jarvis360')
if root not in sys.path:
    sys.path.insert(0, root)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jarvis360.settings')
import django
from django.conf import settings

django.setup()

local_apps = []
for app in settings.INSTALLED_APPS:
    try:
        mod = importlib.import_module(app)
        f = inspect.getsourcefile(mod) or getattr(mod, '__file__', None)
        if f:
            f = os.path.abspath(f)
            if f.startswith(root):
                local_apps.append(app)
    except Exception:
        pass

# Filter out non-app packages that aren't suitable for tests
skip_prefixes = ('django.', 'rest_framework', 'corsheaders')
local_apps = [a for a in local_apps if not a.startswith(skip_prefixes)]

print('Per-app test run for local apps:')
for app in local_apps:
    print('\n--- Running tests for app:', app, '---')
    cmd = [sys.executable, 'manage.py', 'test', app, '-v', '2']
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    print(p.stdout)
    if p.stderr:
        print('STDERR:\n', p.stderr)
    print('Return code:', p.returncode)

print('\nAll per-app test runs completed.')
