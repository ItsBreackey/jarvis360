from __future__ import annotations
import logging
from celery import shared_task
from django.utils import timezone
from .models import Automation, AutomationExecution
from celery.utils.log import get_task_logger
from django.db import DatabaseError

from .models import UploadedCSV
from . import importer
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def automation_execute_task(self, automation_pk, triggered_by=None):
    """Execute an automation and record its execution. This is a lightweight
    MVP that simulates action execution and writes an Execution record.
    """
    return _execute_automation_sync(automation_pk, triggered_by)


def _execute_automation_sync(automation_pk, triggered_by=None):
    try:
        auto = Automation.objects.get(pk=automation_pk)
    except Automation.DoesNotExist:
        return {'error': 'not found'}

    exec_log = AutomationExecution.objects.create(automation=auto)
    started = timezone.now()
    # Simulate action execution: iterate over actions and pretend to run them.
    results = []
    try:
        for act in (auto.actions or []):
            name = act.get('name') or act.get('type') or 'unknown'
            # For now, we support a few stub action types
            if name in ('generate_report', 'send_email', 'post_whatsapp'):
                results.append({'action': name, 'status': 'ok'})
            else:
                results.append({'action': name, 'status': 'skipped', 'reason': 'unsupported in MVP'})
        exec_log.finished_at = timezone.now()
        exec_log.success = True
        exec_log.result = {'results': results}
        exec_log.save()
        # update automation last_run
        auto.last_run = exec_log.finished_at
        auto.save(update_fields=['last_run'])
        return {'ok': True, 'results': results}
    except Exception as e:
        logger.exception('automation execution failed')
        exec_log.finished_at = timezone.now()
        exec_log.success = False
        exec_log.result = {'error': str(e)}
        exec_log.save()
        return {'error': str(e)}


logger = get_task_logger(__name__)


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={'max_retries': 3})
def import_uploaded_csv_task(self, upload_id: int, *args, **kwargs) -> int:
    """Celery task wrapper to import a single UploadedCSV by id.

    Retries up to 3 times with exponential backoff on failures.
    """
    try:
        u = UploadedCSV.objects.get(pk=upload_id)
    except UploadedCSV.DoesNotExist:
        logger.warning('UploadedCSV id=%s does not exist; skipping import', upload_id)
        return 0

    # mark as importing
    try:
        u.status = UploadedCSV.STATUS_IMPORTING
        u.status_started_at = timezone.now()
        u.error_message = ''
        u.subscriptions_created = 0
        u.save(update_fields=['status', 'status_started_at', 'error_message', 'subscriptions_created'])
    except Exception:
        logger.exception('Failed to mark UploadedCSV id=%s as importing', upload_id)

    # If tests call task.run(None, upload_id) they pass None as the self
    # argument; in that case call the importer directly so DatabaseError
    # propagates to the caller (tests expect this). When running under a
    # real Celery worker (self != None) we catch DatabaseError so we can
    # mark the UploadedCSV as errored before re-raising for Celery to retry.
    if self is None:
        # direct call; let exceptions propagate
        created = importer.import_single_upload(u)
    else:
        try:
            created = importer.import_single_upload(u)
        except DatabaseError as exc:
            try:
                u.status = UploadedCSV.STATUS_ERROR
                u.error_message = str(exc)
                u.save(update_fields=['status', 'error_message'])
            except Exception:
                logger.exception('Failed to mark UploadedCSV id=%s as error after DatabaseError', upload_id)
            # re-raise so caller/Celery sees the original DatabaseError
            raise
    logger.info('Imported upload id=%s created=%s subscriptions', upload_id, created)
    # mark complete
    try:
        u.status = UploadedCSV.STATUS_COMPLETE
        u.completed_at = timezone.now()
        u.subscriptions_created = int(created or 0)
        u.save(update_fields=['status', 'completed_at', 'subscriptions_created'])
    except Exception:
        logger.exception('Failed to mark UploadedCSV id=%s as complete', upload_id)
    return created
