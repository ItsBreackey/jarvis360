import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jarvis360.settings')
django.setup()

from unittest.mock import patch
from django.db import DatabaseError
import api.importer as imp
from api.tasks import import_uploaded_csv_task
from api.models import Organization, UploadedCSV

org = Organization.objects.first()
u = UploadedCSV.objects.create(org=org, filename='repro.csv')

print('Before patch, importer:', imp.import_single_upload)
with patch('api.importer.import_single_upload', side_effect=DatabaseError('deadlock')):
    print('Patched importer:', imp.import_single_upload)
    try:
        print('Calling task.run(None, pk)')
        import_uploaded_csv_task.run(None, u.pk)
    except Exception as e:
        print('task.run raised:', type(e), e)
    else:
        print('task.run did not raise')

    try:
        print('Calling importer.import_single_upload(u) directly')
        imp.import_single_upload(u)
    except Exception as e:
        print('direct import raised:', type(e), e)
    else:
        print('direct import did not raise')

print('done')
