import os, sys, inspect, importlib
# Ensure project root is on sys.path so 'jarvis360' package can be imported
root = os.path.abspath(r'D:\BrandStuff\BreackeyPortfolio\ProjectTracker\jarvis360')
if root not in sys.path:
    sys.path.insert(0, root)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jarvis360.settings')
import django
django.setup()
from django.conf import settings
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
print('local_apps:')
for a in local_apps:
    print(a)
