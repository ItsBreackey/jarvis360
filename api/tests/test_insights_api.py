from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.urls import reverse


User = get_user_model()


class InsightsAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='insights_user', password='pass123')

    def test_insights_endpoint_returns_arr_and_mrr(self):
        # force auth so view sees an authenticated user (profile may be missing)
        self.client.force_authenticate(user=self.user)
        url = reverse('insights')
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # ARRSummaryAPIView returns arr_kpis with MRR and ARR keys
        self.assertIn('arr_kpis', data)
        kpis = data['arr_kpis']
        self.assertIn('MRR', kpis)
        self.assertIn('ARR', kpis)