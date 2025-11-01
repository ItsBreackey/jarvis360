from django.test import TestCase
from django.contrib.auth import get_user_model
from api.models import Organization, Customer, Subscription
from api.services.insights import compute_org_kpis
from decimal import Decimal


class InsightsServiceTest(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Org A', slug='orga')
        # create customers with subscriptions
        self.c1 = Customer.objects.create(org=self.org, external_id='c1', name='Customer 1')
        self.c2 = Customer.objects.create(org=self.org, external_id='c2', name='Customer 2')
        Subscription.objects.create(customer=self.c1, mrr=Decimal('100.00'))
        Subscription.objects.create(customer=self.c2, mrr=Decimal('50.00'))

    def test_compute_org_kpis_returns_correct_mrr_and_arr(self):
        out = compute_org_kpis(self.org)
        self.assertIn('kpis', out)
        self.assertIn('top_customers', out)
        kpis = out['kpis']
        # MRR should be 150.0 and ARR 1800.0
        self.assertAlmostEqual(kpis.get('MRR', 0), 150.0)
        self.assertAlmostEqual(kpis.get('ARR', 0), 1800.0)
        tops = out['top_customers']
        # top customer should be c1 with mrr 100.0
        self.assertTrue(any(t.get('customer_id') == 'c1' and abs(t.get('mrr', 0) - 100.0) < 0.001 for t in tops))
