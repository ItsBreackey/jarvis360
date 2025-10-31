from django.test import TestCase
from rest_framework.test import APIClient
from unittest.mock import patch


class AutomationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch('api.views.automation_execute_task')
    def test_create_and_run_automation_via_api(self, mock_task):
        """Register user, create automation, POST run, and assert Celery task was enqueued.

        We patch `api.views.automation_execute_task` to avoid contacting a real broker
        and to assert `.delay()` was invoked with expected arguments.
        """
        # Ensure the patched mock exposes a delay attribute
        mock_task.delay = mock_task.delay or mock_task

        # Register a user (creates org and returns token)
        register_payload = {
            'username': 'api_smoke_user',
            'password': 'pw12345',
            'org_name': 'API Smoke Org',
            'email': 'api_smoke@example.com'
        }
        resp = self.client.post('/api/register/', register_payload, format='json')
        self.assertEqual(resp.status_code, 201)
        token = resp.json().get('token')
        self.assertTrue(token)

        # Authenticate subsequent requests with DRF Token
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token)

        # Create an automation via the API
        payload = {
            'name': 'API Smoke Automation',
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
        run_resp = self.client.post(f'/api/automations/{auto_id}/run/')

        # Assert that our mock's delay was called with the expected args
        self.assertTrue(mock_task.delay.called, msg='Expected automation_execute_task.delay to be called')
        called_args, called_kwargs = mock_task.delay.call_args
        # First positional arg should be automation id
        self.assertEqual(int(called_args[0]), int(auto_id))
        # triggered_by may be passed as a kwarg or positional second arg; allow either
        if 'triggered_by' in called_kwargs:
            self.assertIsNotNone(called_kwargs['triggered_by'])
        else:
            if len(called_args) > 1:
                self.assertIsNotNone(called_args[1])

        # Deterministically execute the automation synchronously and assert an execution exists
        from api.tasks import _execute_automation_sync
        exec_result = _execute_automation_sync(auto_id)
        self.assertTrue(exec_result.get('ok'))

        from api.models import AutomationExecution, Automation
        auto = Automation.objects.get(pk=auto_id)
        execs = AutomationExecution.objects.filter(automation=auto)
        self.assertGreaterEqual(execs.count(), 1)
from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse


class AutomationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_create_and_run_automation_via_api(self):
        # Register a user (creates org and returns token)
        register_payload = {
            'username': 'api_smoke_user',
            'password': 'pw12345',
            'org_name': 'API Smoke Org',
    @patch('api.views.automation_execute_task')
    def test_create_and_run_automation_via_api(self, mock_task):
        }
        resp = self.client.post('/api/register/', register_payload, format='json')
        self.assertEqual(resp.status_code, 201)
        token = resp.json().get('token')
        self.assertTrue(token)

        # Authenticate subsequent requests with DRF Token
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token)

        # Create an automation via the API
        payload = {
            'name': 'API Smoke Automation',
            'natural_language': 'Run a simple smoke sequence',
            'actions': [{'name': 'generate_report'}, {'name': 'send_email'}]
        }
        resp2 = self.client.post('/api/automations/', payload, format='json')
        self.assertIn(resp2.status_code, (200, 201))
        created = resp2.json()
        auto_id = created.get('id') or created.get('pk') or created.get('pk')
        # Some serializers return 'id' while others may expose 'pk'
        if not auto_id:
            # Fallback: try reading location header (not typically present)
            self.fail('Could not determine created automation id from response')

        # Trigger the run endpoint
        run_resp = self.client.post(f'/api/automations/{auto_id}/run/')

        # The view may return 202 (enqueued) or 200 (sync result). If enqueued,
        # emulate worker execution deterministically by calling the sync helper.
        if run_resp.status_code == 202:
            # Import here to avoid importing Celery in module-level scope for tests
            from api.tasks import _execute_automation_sync
            exec_result = _execute_automation_sync(auto_id)
            self.assertTrue(exec_result.get('ok'))
        else:
            # Expect either 200 or a JSON with result
            self.assertIn(run_resp.status_code, (200,))
            data = run_resp.json()
            # If result returned include ok flag
            if isinstance(data, dict):
                self.assertTrue(data.get('ok') or data.get('result'))

        # Finally assert an AutomationExecution exists
        from api.models import AutomationExecution, Automation
        auto = Automation.objects.get(pk=auto_id)
        execs = AutomationExecution.objects.filter(automation=auto)
        self.assertGreaterEqual(execs.count(), 1)
