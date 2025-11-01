from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.urls import reverse
from api.models import Organization, Customer, Subscription
from decimal import Decimal


User = get_user_model()


class InsightsPermissionTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_insights_requires_authentication(self):
        url = reverse('insights')
        resp = self.client.get(url)
        # DRF default for unauthenticated is 401 Unauthorized
        self.assertIn(resp.status_code, (401, 403))


class InsightsLargeDatasetTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='BigOrg', slug='bigorg')
        self.user = User.objects.create_user(username='biguser', password='pass')
        profile = getattr(self.user, 'profile', None)
        if profile:
            profile.org = self.org
            profile.save()

    def test_large_number_of_subscriptions_aggregates(self):
        # create many customers/subscriptions
        count = 500
        for i in range(count):
            c = Customer.objects.create(org=self.org, external_id=f'c{i}', name=f'Cust {i}')
            Subscription.objects.create(customer=c, mrr=Decimal('1.00'))

        client = APIClient()
        client.force_authenticate(user=self.user)
        url = reverse('insights')
        resp = client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        kpis = data.get('arr_kpis') or {}
        # MRR should be count * 1.0
        self.assertAlmostEqual(kpis.get('MRR', 0), float(count))
