from django.test import TestCase
from rest_framework.test import APIClient
from unittest.mock import patch


class AutomationAPIIntegrationTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch('api.tasks.automation_execute_task')
    def test_create_and_run_automation_via_api(self, mock_task):
        # Ensure the patched mock exposes a delay attribute
        mock_task.delay = mock_task.delay or mock_task

        # Register a user (creates org and returns token)
        register_payload = {
            'username': 'api_smoke_user2',
            'password': 'pw12345',
            'org_name': 'API Smoke Org 2',
            'email': 'api_smoke2@example.com'
        }
        resp = self.client.post('/api/register/', register_payload, format='json')
        self.assertEqual(resp.status_code, 201)
        token = resp.json().get('token')
        self.assertTrue(token)

        # Authenticate subsequent requests with DRF Token
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token)

        # Create an automation via the API
        payload = {
            'name': 'API Smoke Automation 2',
            'natural_language': 'Run a simple smoke sequence',
            'actions': [{'name': 'generate_report'}, {'name': 'send_email'}]
        }
        resp2 = self.client.post('/api/automations/', payload, format='json')
        self.assertIn(resp2.status_code, (200, 201))
        created = resp2.json()
        auto_id = created.get('id') or created.get('pk')
        if not auto_id:
            self.fail('Could not determine created automation id from response')

        # Trigger the run endpoint; because we've patched the task, .delay() should be called
        _ = self.client.post(f'/api/automations/{auto_id}/run/')

        # Assert that our mock's delay was called with the expected args
        self.assertTrue(mock_task.delay.called, msg='Expected automation_execute_task.delay to be called')
        called_args, called_kwargs = mock_task.delay.call_args
        # First positional arg should be automation id
        self.assertEqual(int(called_args[0]), int(auto_id))

        # Deterministically execute the automation synchronously and assert an execution exists
        from api.tasks import _execute_automation_sync
        exec_result = _execute_automation_sync(auto_id)
        self.assertTrue(exec_result.get('ok'))

        from api.models import AutomationExecution, Automation
        auto = Automation.objects.get(pk=auto_id)
        execs = AutomationExecution.objects.filter(automation=auto)
        self.assertGreaterEqual(execs.count(), 1)
