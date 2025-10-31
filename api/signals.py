from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
import logging

logger = logging.getLogger(__name__)
from django.db import close_old_connections, transaction
from .models import UploadedCSV, Subscription
from .importer import import_single_upload
import threading
from django.conf import settings as dj_settings
try:
    # import the celery task; optional if celery is not installed in some environments
    from .tasks import import_uploaded_csv_task
except Exception:
    import_uploaded_csv_task = None


def _run_import_sync(upload_id):
    # Ensure this thread does not reuse the parent's DB connection
    try:
        close_old_connections()
    except Exception:
        pass

    try:
        u = UploadedCSV.objects.get(pk=upload_id)
        # helper to persist model updates with a few retries to survive
        # transient sqlite 'database is locked' conditions
        def save_with_retry(instance, update_fields=None, max_attempts=6):
            import time as _time
            from django.db import OperationalError as _OpErr
            attempts = 0
            while True:
                try:
                    instance.save(update_fields=update_fields)
                    return True
                except _OpErr:
                    attempts += 1
                    if attempts >= max_attempts:
                        raise
                    _time.sleep(0.15 * attempts)
                except Exception:
                    # non-OperationalError exceptions should be raised
                    raise

        # mark importing
        try:
            from django.utils import timezone
            u.status = UploadedCSV.STATUS_IMPORTING
            u.status_started_at = timezone.now()
            u.error_message = ''
            u.subscriptions_created = 0
            try:
                save_with_retry(u, update_fields=['status', 'status_started_at', 'error_message', 'subscriptions_created'])
            except Exception:
                logger.exception('Failed to mark upload %s as importing', upload_id)
        except Exception:
            logger.exception('Failed to set importing fields for upload %s', upload_id)

        # run import and capture exceptions to surface back to the upload record
        try:
            created = import_single_upload(u, sample_lines=getattr(settings, 'IMPORT_SAMPLE_LINES', 200))
        except Exception as exc:
            # record the full traceback/message on the upload so the frontend can show a useful message
            try:
                import traceback as _tb
                tb = _tb.format_exc()
                u.status = UploadedCSV.STATUS_ERROR
                u.error_message = str(exc) + '\n' + tb[:1000]
                try:
                    save_with_retry(u, update_fields=['status', 'error_message'])
                except Exception:
                    logger.exception('Failed to persist error state for upload %s after exception', upload_id)
            except Exception:
                logger.exception('Failed to prepare error trace for upload %s', upload_id)
            logger.exception('Import failed for upload %s', upload_id)
            return

        try:
            from django.utils import timezone
            u.status = UploadedCSV.STATUS_COMPLETE
            u.completed_at = timezone.now()
            u.subscriptions_created = int(created or 0)
            try:
                save_with_retry(u, update_fields=['status', 'completed_at', 'subscriptions_created'])
            except Exception:
                logger.exception('Failed to mark UploadedCSV id=%s as complete', upload_id)
        except Exception:
            logger.exception('Failed to set complete fields for UploadedCSV id=%s', upload_id)
    except Exception:
        # Last-resort error handling: ensure the upload record is marked with an error
        try:
            u = UploadedCSV.objects.filter(pk=upload_id).first()
            if u:
                import traceback as _tb
                tb = _tb.format_exc()
                u.status = UploadedCSV.STATUS_ERROR
                u.error_message = 'Import failed (see server logs)\n' + tb[:1000]
                try:
                    save_with_retry(u, update_fields=['status', 'error_message'])
                except Exception:
                    logger.exception('Failed to mark upload %s as error in outer exception handler', upload_id)
        except Exception:
            logger.exception('Outer exception handler failed for upload %s', upload_id)
        return


@receiver(post_save, sender=UploadedCSV)
def on_upload_saved(sender, instance: UploadedCSV, created, **kwargs):
    # Only trigger imports when a file is present and the DB record is still
    # in the pending state. This prevents duplicate imports when callers
    # (or tests) save the model multiple times (for example, file.save()
    # followed by instance.save()). We check the database value rather
    # than the in-memory `instance` so previous on-save updates are
    # respected.
    if not instance.file:
        return
    # If subscriptions already exist for this upload, assume the import
    # has already run and skip (idempotency guard).
    if Subscription.objects.filter(source_upload=instance).exists():
        logger.debug('Skipping import for upload %s because subscriptions already exist', instance.pk)
        return
    current_status = UploadedCSV.objects.filter(pk=instance.pk).values_list('status', flat=True).first()
    if current_status is None or current_status != UploadedCSV.STATUS_PENDING:
        return

    # In tests or when DEBUG_IMPORT_SYNC is set, run sync to simplify testing
    if getattr(settings, 'DEBUG_IMPORT_SYNC', False):
        # Tests run inside transactions; run the importer inline but avoid
        # mutating the instance via .save() to prevent recursive post_save.
        logger.debug('DEBUG_IMPORT_SYNC handler invoked for upload %s (created=%s)', instance.pk, created)
        try:
            # Only run import if the DB record is still pending. This avoids
            # duplicate imports when multiple post_save signals occur (for
            # example, file.save() and a subsequent save()). Use update()
            # to change status without re-triggering post_save.
            from django.utils import timezone
            # Atomically claim the upload record by switching status from
            # PENDING -> IMPORTING. If another process/signals already
            # claimed it (or completed it), the update will affect 0 rows
            # and we should skip running the importer.
            rows = UploadedCSV.objects.filter(pk=instance.pk, status=UploadedCSV.STATUS_PENDING).update(
                status=UploadedCSV.STATUS_IMPORTING,
                status_started_at=timezone.now(),
                error_message='',
                subscriptions_created=0,
            )
            if not rows:
                logger.debug('Skipping DEBUG import for upload %s because it was claimed elsewhere', instance.pk)
                return

            print(f"[DEBUG] importer starting for upload {instance.pk}; claimed rows={rows}")
            logger.debug('Importer starting for upload %s (claimed rows=%s)', instance.pk, rows)
            created = import_single_upload(instance, sample_lines=getattr(settings, 'IMPORT_SAMPLE_LINES', 200))
            print(f"[DEBUG] importer finished for upload {instance.pk}; created={created}")

            UploadedCSV.objects.filter(pk=instance.pk).update(
                status=UploadedCSV.STATUS_COMPLETE,
                completed_at=timezone.now(),
                subscriptions_created=int(created or 0),
            )
        except Exception:
            import traceback as _tb
            tb = _tb.format_exc()
            UploadedCSV.objects.filter(pk=instance.pk).update(
                status=UploadedCSV.STATUS_ERROR,
                error_message='Import failed (see server logs)\n' + tb[:1000],
            )
        return
    # Prefer enqueueing a Celery task if available, otherwise fall back to a
    # lightweight background thread (suitable for development but not prod).
    if import_uploaded_csv_task is not None and not getattr(dj_settings, 'DEBUG', False):
        # enqueue the task (Celery will run it asynchronously)
        try:
            delay_fn = getattr(import_uploaded_csv_task, 'delay', None)
            if callable(delay_fn):
                delay_fn(instance.pk)
                return
            # some task wrappers expose .apply_async or are callable Task instances
            if callable(import_uploaded_csv_task):
                # try common celery interface
                try:
                    import_uploaded_csv_task.delay(instance.pk)
                    return
                except Exception:
                    pass
        except Exception:
            # fall back to thread if enqueue fails
            pass

    # Schedule the import to run only after the creating DB transaction
    # has committed. This avoids sqlite 'database is locked' errors caused
    # by a background thread trying to write while the request transaction
    # is still open. Also close old connections in the callback so the
    # thread establishes a fresh DB connection.
    def _start_thread():
        try:
            close_old_connections()
        except Exception:
            pass
        t = threading.Thread(target=_run_import_sync, args=(instance.pk,))
        t.daemon = True
        t.start()

    try:
        transaction.on_commit(_start_thread)
    except Exception:
        # If on_commit is unavailable or fails, fall back to immediate start
        _start_thread()
