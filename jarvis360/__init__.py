try:
	from .celery import app as celery_app  # type: ignore
	# Expose Celery app as a module-level variable for `celery -A jarvis360` discovery
	__all__ = ('celery_app',)
except Exception:
	# Celery is optional in some environments (tests or minimal dev).
	celery_app = None  # type: ignore
	__all__ = ()
