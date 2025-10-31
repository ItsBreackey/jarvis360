from django.db import transaction, OperationalError
from .models import Customer, Subscription, UploadedCSV
from analysis.normalize import normalize_csv_text
import time


def import_single_upload(upload: UploadedCSV, sample_lines: int | None = None) -> int:
    """Import a single UploadedCSV into Customer and Subscription rows.

    Returns number of subscriptions created.
    This implementation minimizes sqlite contention by collecting Subscription
    instances and performing chunked bulk_create with retries on transient
    OperationalError.
    """
    if not upload or not upload.file:
        return 0

    try:
        upload.file.open('rb')
        raw = upload.file.read().decode('utf-8', errors='ignore')
        upload.file.close()
    except Exception:
        return 0

    # normalize_csv_text expects an int or None; ensure typing is explicit
    sl = int(sample_lines) if sample_lines is not None else None
    recs = normalize_csv_text(raw, sample_lines=sl)
    subs_to_create = []
    for r in recs:
        cid = r.get('customer_id') or None
        name = r.get('raw', {}).get('name') if isinstance(r.get('raw'), dict) else None
        customer, _ = Customer.objects.get_or_create(
            org=upload.org,
            external_id=cid,
            defaults={'name': name or (cid or '')},
        )
        subs_to_create.append(Subscription(
            customer=customer,
            mrr=r.get('mrr') or 0,
            start_date=r.get('signup_date'),
            source_upload=upload,
        ))

    created = 0
    # bulk_create in chunks to reduce number of write operations
    chunk_size = 200
    for i in range(0, len(subs_to_create), chunk_size):
        batch = subs_to_create[i:i + chunk_size]
        retries = 0
        while True:
            try:
                # use atomic to ensure batch is written cleanly
                with transaction.atomic():
                    Subscription.objects.bulk_create(batch, batch_size=chunk_size)
                created += len(batch)
                break
            except OperationalError:
                retries += 1
                if retries > 6:
                    # escalate after several attempts
                    raise
                time.sleep(0.2 * retries)

    return created
