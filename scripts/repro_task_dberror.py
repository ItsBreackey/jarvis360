from unittest.mock import patch
from django.db import DatabaseError
from api.models import Organization, UploadedCSV
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from api.tasks import import_uploaded_csv_task

import time
slug = f't-{int(time.time())}'
org = Organization.objects.create(name='T', slug=slug)
User = get_user_model()
user = User.objects.create_user('u', 'u@example.com', 'p')
f = ContentFile(b'a,b,c\n1,2,3')
f.name = 't.csv'
upload = UploadedCSV.objects.create(org=org, uploaded_by=user, file=f, filename='t.csv')
print('upload', upload.pk)
import api.importer as imp_mod
print('before patch importer.import_single_upload =', imp_mod.import_single_upload)
try:
    with patch('api.importer.import_single_upload', side_effect=DatabaseError('deadlock')):
        print('during patch importer.import_single_upload =', imp_mod.import_single_upload)
        import_uploaded_csv_task.run(None, upload.pk)
except Exception as e:
    print('raised:', type(e), e)
else:
    print('no exception')
