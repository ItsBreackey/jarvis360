from django.test import TestCase, override_settings
from django.core.files.base import ContentFile
from api.models import UploadedCSV, Organization, Customer, Subscription


@override_settings(DEBUG_IMPORT_SYNC=True)
class ImportSignalTest(TestCase):
    def test_signal_triggers_import(self):
        org = Organization.objects.create(name='SigOrg', slug='sigorg')
        u = UploadedCSV.objects.create(org=org, filename='sig.csv')
        csv = 'id,MRR,signup_date\nalpha,123,2024-01-01\n'
        u.file.save('sig.csv', ContentFile(csv.encode('utf-8')))
        u.save()
        # After save, signal should have imported customer and subscription synchronously
        customers = Customer.objects.filter(org=org)
        subs = Subscription.objects.filter(customer__org=org)
        self.assertEqual(customers.count(), 1)
        self.assertEqual(subs.count(), 1)
