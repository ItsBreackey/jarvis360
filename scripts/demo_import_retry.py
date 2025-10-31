#!/usr/bin/env python
"""Demo script to run the importer task in a developer environment with retries.

This script is idempotent and will retry on transient sqlite "database is locked"
errors. It patches `api.importer.import_single_upload` to simulate transient
failures (for local testing) and calls the Celery-wrapped task synchronously via
`import_uploaded_csv_task.run(upload_id)`.

Usage:
  python scripts/demo_import_retry.py

Note: this script expects to be run from a developer environment where the
virtualenv and Django settings are available. It inserts the project root onto
sys.path so it can be executed from anywhere.
"""
from __future__ import annotations

import os
import sys
import time
import logging
from unittest.mock import patch
from django.db import DatabaseError

# Put project root on sys.path so imports like `jarvis360.settings` work.
PROJECT_ROOT = r"D:\BrandStuff\BreackeyPortfolio\ProjectTracker\jarvis360"
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jarvis360.settings')
import django
django.setup()

from api.tasks import import_uploaded_csv_task
from api.models import Organization, UploadedCSV
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db.utils import OperationalError as DjOperationalError

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# Simulated importer responses: two transient DB errors, then success returning 1
responses = [DatabaseError('deadlock'), DatabaseError('timeout'), 1]

def side_effect(upload):
    r = responses.pop(0)
    if isinstance(r, Exception):
        raise r
    return r


def main():
    # Ensure idempotent org + user
    org, _ = Organization.objects.get_or_create(slug='tmporg', defaults={'name': 'TmpOrg'})
    User = get_user_model()
    user, _ = User.objects.get_or_create(username='tmpuser', defaults={'is_active': True})
    if not user.has_usable_password():
        user.set_password('p')
        user.save()

    # Create a small in-memory CSV upload
    f = ContentFile(b'customer_id,mrr,signup_date\n1,100,2020-01-01')
    f.name = 'tmp.csv'
    upload = UploadedCSV.objects.create(org=org, uploaded_by=user, file=f, filename='tmp.csv')

    # Patch the importer to simulate transient failures
    with patch('api.importer.import_single_upload', side_effect=side_effect):
        max_retries = 6
        attempt = 0
        backoff = 0.5
        while True:
            attempt += 1
            try:
                log.info('Calling import_uploaded_csv_task.run (attempt %d)', attempt)
                result = import_uploaded_csv_task.run(upload.pk)
                log.info('Task run result: %s', result)
                print('run result:', result)
                break
            except (DjOperationalError, DatabaseError, OSError) as exc:
                # Treat as transient; retry with backoff up to max_retries
                if attempt >= max_retries:
                    log.exception('Max retries reached, giving up')
                    print('raised:', type(exc), exc)
                    break
                log.warning('Transient DB/OS error on attempt %d: %s -- retrying in %.1fs', attempt, exc, backoff)
                time.sleep(backoff)
                backoff *= 2
            except Exception as exc:
                # Non-transient
                log.exception('Non-transient error running task')
                print('raised:', type(exc), exc)
                break


if __name__ == '__main__':
    main()
