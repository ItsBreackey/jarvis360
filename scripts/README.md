Scripts for local debugging and demos

Files
- `demo_import_retry.py` - idempotent demo that patches the importer to simulate transient failures and calls the Celery-wrapped task synchronously. Retries on sqlite 'database is locked' / transient DB errors.
- `check_settings_load.py` - quick check to confirm Django settings load and that `django-environ` warnings are silent during `.env` loading.

Usage

Activate your venv and run from project root:

```powershell
# from project root (where manage.py lives)
python scripts/check_settings_load.py
python scripts/demo_import_retry.py
```

Notes
- `demo_import_retry.py` inserts the project root onto `sys.path` so it can be executed from anywhere. It is intentionally forgiving to make local debugging smoother.
- I applied a small change in `jarvis360/settings.py` to temporarily raise the django-environ logger level to ERROR during `.env` read, which prevents the `Invalid line:` messages from printing during demos. To revert that behavior, remove or comment the `logging.getLogger('environ.environ').setLevel(logging.ERROR)` line in `settings.py`.
