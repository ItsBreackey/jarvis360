import os
import sys
import json

# Ensure settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jarvis360.settings')

# Ensure project root is on PYTHONPATH so the settings package can be imported
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import django
django.setup()


from django.contrib.auth import get_user_model
from api.models import Organization, Automation, AutomationExecution
from api.tasks import _execute_automation_sync
from django.utils import timezone

User = get_user_model()

def main():
    try:
        org, _ = Organization.objects.get_or_create(slug='dev-org-smoke', defaults={'name': 'Dev Org (smoke)'})

        username = 'smoke_user'
        email = 'smoke@example.com'
        password = 'smoke-pass'
        user, created = User.objects.get_or_create(username=username, defaults={'email': email})
        if created:
            user.set_password(password)
            user.save()
        # Ensure profile org linkage if profile exists
        try:
            prof = getattr(user, 'profile', None)
            if prof:
                prof.org = org
                prof.save()
        except Exception:
            pass

        # Create an automation with a few stub actions
        actions = [
            {'name': 'generate_report'},
            {'name': 'send_email'},
            {'name': 'unknown_action'}
        ]
        auto = Automation.objects.create(org=org, name='Smoke Automation', natural_language='Run smoke actions', actions=actions, created_by=user)

        print(json.dumps({'created_automation_pk': auto.pk}))

        # Execute synchronously using the internal helper
        result = _execute_automation_sync(auto.pk)

        # Refresh automation from DB
        auto.refresh_from_db()

        execs = list(AutomationExecution.objects.filter(automation=auto).order_by('-started_at').values('pk', 'started_at', 'finished_at', 'success', 'result'))

        out = {
            'automation_pk': auto.pk,
            'last_run': auto.last_run.isoformat() if auto.last_run else None,
            'execute_result': result,
            'executions': execs,
        }
        print(json.dumps(out, default=str))

    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
