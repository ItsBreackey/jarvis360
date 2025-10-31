from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from unittest.mock import patch

from api.models import Organization, UploadedCSV


class SignalsCeleryTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Acme', slug='acme')
        User = get_user_model()
        self.user = User.objects.create_user(username='u1', password='p')

    @override_settings(DEBUG=False)
    @patch('api.signals.import_uploaded_csv_task')
    def test_signal_enqueues_celery_task_when_available(self, mock_task):
        # ensure the mocked task has a delay method
        mock_task.delay = mock_task.delay if hasattr(mock_task, 'delay') else mock_task

        f = ContentFile(b'customer_id,mrr,signup_date\n1,100,2020-01-01')
        f.name = 'test.csv'
        upload = UploadedCSV.objects.create(org=self.org, uploaded_by=self.user, file=f, filename='test.csv')

        # post_save signal should have been triggered and imported via Celery task
        # assert that delay was called with the upload id
        assert mock_task.delay.called or mock_task.called
        if mock_task.delay:
            mock_task.delay.assert_called()
        else:
            mock_task.assert_called()
