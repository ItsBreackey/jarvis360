import os
from celery import Celery

# Set default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jarvis360.settings')

app = Celery('jarvis360')

# Read config from Django settings, using a 'CELERY_' prefix for Celery-specific settings
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks in installed apps
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    # simple debug task used during development
    return f'Request: {self.request!r}'
