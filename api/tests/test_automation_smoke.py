from django.test import TestCase
from django.contrib.auth import get_user_model
from api.models import Organization, Automation, AutomationExecution
from api.tasks import _execute_automation_sync


class AutomationSmokeTest(TestCase):
    def test_execute_automation_creates_execution(self):
        # Create organization and user
        org = Organization.objects.create(name='Test Org', slug='test-org-smoke')
        User = get_user_model()
        user = User.objects.create_user(username='testuser', email='t@example.com', password='pass')

        # Attach profile org if profile exists (the project creates profiles via signal)
        prof = getattr(user, 'profile', None)
        if prof:
            prof.org = org
            prof.save()

        # Create automation with stub actions
        actions = [
            {'name': 'generate_report'},
            {'name': 'send_email'},
            {'name': 'unknown_action'},
        ]
        auto = Automation.objects.create(org=org, name='Test Auto', natural_language='Smoke test', actions=actions, created_by=user)

        # Execute synchronously
        result = _execute_automation_sync(auto.pk)

        # Verify result indicates OK
        self.assertTrue(result.get('ok'), msg=f"Expected ok result, got: {result}")

        # Verify an AutomationExecution row was created and marked successful
        execs = AutomationExecution.objects.filter(automation=auto)
        self.assertEqual(execs.count(), 1)
        e = execs.first()
        self.assertTrue(e.success)
        self.assertIn('results', e.result)

        # Ensure automation.last_run updated to the execution finished time
        auto.refresh_from_db()
        self.assertIsNotNone(auto.last_run)
        # finished_at should be equal to automation.last_run
        self.assertEqual(e.finished_at, auto.last_run)
