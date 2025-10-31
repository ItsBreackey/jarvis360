from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Organization, Dashboard


User = get_user_model()


class DashboardSerializerTests(APITestCase):
    def setUp(self):
        # Create an organization and a user
        self.org = Organization.objects.create(name='TestOrg', slug='testorg')
        self.user = User.objects.create_user(username='tester', password='pass')
        # attach org to user's profile if available
        try:
            self.user.profile.org = self.org
            self.user.profile.save()
        except Exception:
            pass

    def test_invalid_visibility_rejected(self):
        """Serializer should reject visibility values outside defined choices."""
        self.client.force_authenticate(self.user)
        url = '/api/dashboards/'
        payload = {
            'name': 'Bad Visibility',
            'config': {'data': {}},
            'visibility': 'not-a-valid-choice'
        }
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, msg=f"Expected 400, got {resp.status_code} - {getattr(resp, 'data', resp.content)}")

    def test_create_and_publish_workflow(self):
        """Create a dashboard then patch visibility to public."""
        self.client.force_authenticate(self.user)
        url = '/api/dashboards/'
        payload = {'name': 'Smoke Dashboard', 'config': {'data': {}}, }
        resp = self.client.post(url, payload, format='json')
        self.assertIn(resp.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK), msg=f"Unexpected status {resp.status_code}: {resp.data}")
        data = resp.json()
        dash_id = data.get('id')
        self.assertIsNotNone(dash_id, msg=f"Dashboard id not returned: {data}")

        patch_url = f'/api/dashboards/{dash_id}/'
        patch_resp = self.client.patch(patch_url, {'visibility': Dashboard.VISIBILITY_PUBLIC}, format='json')
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK, msg=f"Patch failed: {patch_resp.status_code} {patch_resp.data}")
        patched = patch_resp.json()
        self.assertEqual(patched.get('visibility'), Dashboard.VISIBILITY_PUBLIC)
