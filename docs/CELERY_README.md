Run a Celery worker for import-on-save tasks

This project uses Celery to run CSV import jobs created by saving an UploadedCSV record.

Prerequisites
- Redis running locally (default broker URL redis://localhost:6379/0)
- Python deps installed (see `requirements.txt`)

How to run locally (development)

1. Install dependencies:

```powershell
# from repo root
python -m pip install -r requirements.txt
```

2. Start Redis (example using Docker):

```powershell
docker run -p 6379:6379 --name jarvis-redis -d redis:7
```

3. Start Django (in another shell):

```powershell
python manage.py runserver 127.0.0.1:8000
```

4. Start a Celery worker:

```powershell
# from repo root
# Uses the celery app defined in jarvis360/celery.py
celery -A jarvis360 worker -l info
```

Notes
- In test mode (settings.DEBUG_IMPORT_SYNC=True), imports run synchronously during the `post_save` signal to make tests deterministic.
- If Celery is not available or the worker isn't running, the signal falls back to a local background thread (development only).

Security
- Do not run Redis without proper network restrictions in production.
