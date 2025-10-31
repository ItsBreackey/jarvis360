from django.test import TestCase
from django.core.files.base import ContentFile
from django.core.management import call_command
from api.models import UploadedCSV, Organization, Customer, Subscription
from django.contrib.auth import get_user_model

User = get_user_model()


class ImportUploadsTest(TestCase):
    def setUp(self):
        # create org and upload
        self.org = Organization.objects.create(name='TestOrg', slug='testorg')
        u = UploadedCSV.objects.create(org=self.org, filename='test.csv')
        csv = 'id,MRR,signup_date\nalpha,100,2024-01-05\nbeta,200,2024-02-01\n'
        u.file.save('test.csv', ContentFile(csv.encode('utf-8')))
        u.save()

    def test_import_command_creates_customers_and_subs(self):
        out = call_command('import_uploaded_csvs')
        # after import, ensure customers and subscriptions created
        customers = Customer.objects.filter(org=self.org)
        subs = Subscription.objects.filter(customer__org=self.org)
        self.assertEqual(customers.count(), 2)
        self.assertEqual(subs.count(), 2)
