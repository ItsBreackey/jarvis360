from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.urls import reverse
from api.models import Organization, Customer, Subscription
from decimal import Decimal


User = get_user_model()


class InsightsAPIScopingTest(TestCase):
    def setUp(self):
        # org A and org B
        self.org_a = Organization.objects.create(name='Org A', slug='orga')
        self.org_b = Organization.objects.create(name='Org B', slug='orgb')
        # customers and subs for org A
        c1 = Customer.objects.create(org=self.org_a, external_id='a1', name='A One')
        Subscription.objects.create(customer=c1, mrr=Decimal('200.00'))
        # customers and subs for org B
        c2 = Customer.objects.create(org=self.org_b, external_id='b1', name='B One')
        Subscription.objects.create(customer=c2, mrr=Decimal('50.00'))

        # user in org A
        self.user_a = User.objects.create_user(username='usera', password='pass')
        # attach profile and org
        profile = getattr(self.user_a, 'profile', None)
        if profile:
            profile.org = self.org_a
            profile.save()
        self.client = APIClient()

    def test_org_scoping_returns_only_org_subscriptions(self):
        self.client.force_authenticate(user=self.user_a)
        url = reverse('insights')
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        kpis = data.get('arr_kpis') or {}
        self.assertAlmostEqual(kpis.get('MRR', 0), 200.0)


class InsightsSinceFilterTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Org S', slug='orgs')
        self.c1 = Customer.objects.create(org=self.org, external_id='s1', name='S One')
        # old subscription
        Subscription.objects.create(customer=self.c1, mrr=Decimal('100.00'), start_date='2020-01-01')
        # new subscription
        Subscription.objects.create(customer=self.c1, mrr=Decimal('300.00'), start_date='2025-01-01')
        self.user = User.objects.create_user(username='users', password='pass')
        profile = getattr(self.user, 'profile', None)
        if profile:
            profile.org = self.org
            profile.save()
        self.client = APIClient()

    def test_since_filter_limits_subscriptions(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('insights') + '?since=2024-01-01'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        kpis = data.get('arr_kpis') or {}
        # only the 2025 subscription (300) should be counted
        self.assertAlmostEqual(kpis.get('MRR', 0), 300.0)
