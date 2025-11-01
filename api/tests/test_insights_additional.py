from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.urls import reverse
from api.models import Organization, Customer, Subscription
from decimal import Decimal


User = get_user_model()


class InsightsSinceInvalidParamTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='SinceOrg', slug='sinceorg')
        self.c1 = Customer.objects.create(org=self.org, external_id='s1', name='Since One')
        Subscription.objects.create(customer=self.c1, mrr=Decimal('123.45'), start_date='2025-01-01')
        self.user = User.objects.create_user(username='since_user', password='pass')
        profile = getattr(self.user, 'profile', None)
        if profile:
            profile.org = self.org
            profile.save()
        self.client = APIClient()

    def test_invalid_since_param_is_ignored_and_counts_all_subs(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('insights') + '?since=not-a-date'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        kpis = data.get('arr_kpis') or {}
        self.assertAlmostEqual(kpis.get('MRR', 0), 123.45)


class InsightsNoSubscriptionsTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='EmptyOrg', slug='emptyorg')
        self.user = User.objects.create_user(username='empty_user', password='pass')
        profile = getattr(self.user, 'profile', None)
        if profile:
            profile.org = self.org
            profile.save()
        self.client = APIClient()

    def test_no_subscriptions_returns_zero_kpis(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('insights')
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        kpis = data.get('arr_kpis') or {}
        self.assertAlmostEqual(kpis.get('MRR', 0), 0.0)
        self.assertAlmostEqual(kpis.get('ARR', 0), 0.0)


class InsightsNonNumericMRRTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='CoerceOrg', slug='coerceorg')
        self.c1 = Customer.objects.create(org=self.org, external_id='c1', name='Coerce One')
        # Some schemas require non-null mrr; create as zero to simulate no revenue
        # (compute_org_kpis should treat this as zero).
        Subscription.objects.create(customer=self.c1, mrr=Decimal('0.00'))
        self.user = User.objects.create_user(username='coerce_user', password='pass')
        profile = getattr(self.user, 'profile', None)
        if profile:
            profile.org = self.org
            profile.save()
        self.client = APIClient()

    def test_none_mrr_is_treated_as_zero(self):
        self.client.force_authenticate(user=self.user)
        url = reverse('insights')
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        kpis = data.get('arr_kpis') or {}
        self.assertAlmostEqual(kpis.get('MRR', 0), 0.0)
