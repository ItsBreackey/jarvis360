from django.test import TestCase
from rest_framework.test import APIClient
from unittest.mock import patch, Mock
from django.urls import reverse
from django.contrib.auth import get_user_model

User = get_user_model()


class AutomationTaskPatchTargetsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='patch_user', password='pw')
        # create org via register flow is heavier; attach profile if present
        profile = getattr(self.user, 'profile', None)
        if profile:
            # leave org unset here; tests will create automation via API which sets org
            profile.save()

    def _create_and_authenticate(self, username_suffix=''):
        # Register a user to create org/profile and get token
        payload = {
            'username': f'patch_api_user{username_suffix}',
            'password': 'pw12345',
            'org_name': f'Patch Org {username_suffix}',
            'email': f'patch{username_suffix}@example.com',
        }
        resp = self.client.post('/api/register/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        token = resp.json().get('token')
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token)
        return token

    @patch('api.views.automation_execute_task')
    def test_view_honors_api_views_patch(self, mock_task):
        # Ensure delay attribute present
        mock_task.delay = Mock()
        self._create_and_authenticate('-v')

        # create automation
        payload = {'name': 'Patch Test', 'natural_language': 'do something', 'actions': []}
        resp = self.client.post('/api/automations/', payload, format='json')
        self.assertIn(resp.status_code, (200, 201))
        created = resp.json()
        auto_id = created.get('id') or created.get('pk')

        # trigger run
        _ = self.client.post(f'/api/automations/{auto_id}/run/')

        self.assertTrue(mock_task.delay.called, 'Expected api.views.automation_execute_task.delay to be called')

    @patch('api.tasks.automation_execute_task')
    def test_view_honors_api_tasks_patch(self, mock_task):
        # Ensure delay attribute present
        mock_task.delay = Mock()
        self._create_and_authenticate('-t')

        # create automation
        payload = {'name': 'Patch Test T', 'natural_language': 'do something else', 'actions': []}
        resp = self.client.post('/api/automations/', payload, format='json')
        self.assertIn(resp.status_code, (200, 201))
        created = resp.json()
        auto_id = created.get('id') or created.get('pk')

        # trigger run
        _ = self.client.post(f'/api/automations/{auto_id}/run/')

        self.assertTrue(mock_task.delay.called, 'Expected api.tasks.automation_execute_task.delay to be called')
