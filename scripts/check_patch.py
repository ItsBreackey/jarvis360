import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','jarvis360.settings')
django.setup()
from unittest.mock import patch
from django.db import DatabaseError
import api.importer as imp
print('orig', imp.import_single_upload)
with patch('api.importer.import_single_upload', side_effect=DatabaseError('deadlock')):
    print('patched', imp.import_single_upload)
    try:
        imp.import_single_upload(None)
    except Exception as e:
        print('raised', type(e), e)
    else:
        print('no raise')
