from django.db import models
from decimal import Decimal
from django.conf import settings


class Organization(models.Model):
	"""Simple tenant/organization model."""
	name = models.CharField(max_length=255)
	slug = models.SlugField(max_length=100, unique=True)
	created_at = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return self.name


class UploadedCSV(models.Model):
	"""Persist uploaded CSV files linked to an organization and user."""
	org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='uploads')
	uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
	file = models.FileField(upload_to='uploads/csvs/')
	filename = models.CharField(max_length=512, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	# Import status tracking
	STATUS_PENDING = 'pending'
	STATUS_IMPORTING = 'importing'
	STATUS_COMPLETE = 'complete'
	STATUS_ERROR = 'error'
	IMPORT_STATUS_CHOICES = [
		(STATUS_PENDING, 'Pending'),
		(STATUS_IMPORTING, 'Importing'),
		(STATUS_COMPLETE, 'Complete'),
		(STATUS_ERROR, 'Error'),
	]
	status = models.CharField(max_length=32, choices=IMPORT_STATUS_CHOICES, default=STATUS_PENDING)
	status_started_at = models.DateTimeField(null=True, blank=True)
	completed_at = models.DateTimeField(null=True, blank=True)
	error_message = models.TextField(blank=True, null=True)
	subscriptions_created = models.IntegerField(default=0)

	def __str__(self):
		return f"{self.filename} ({self.org})"


class Dashboard(models.Model):
	"""Saved dashboard configuration per organization."""
	org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='dashboards')
	name = models.CharField(max_length=255)
	slug = models.SlugField(max_length=255)
	VISIBILITY_PRIVATE = 'private'
	VISIBILITY_PUBLIC = 'public'
	VISIBILITY_CHOICES = [
		(VISIBILITY_PRIVATE, 'Private'),
		(VISIBILITY_PUBLIC, 'Public'),
	]
	visibility = models.CharField(max_length=16, choices=VISIBILITY_CHOICES, default=VISIBILITY_PRIVATE)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
	config = models.JSONField(default=dict)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		unique_together = (('org', 'slug'),)

	def __str__(self):
		return f"{self.name} ({self.org})"


class Customer(models.Model):
	"""Normalized customer record derived from uploaded CSVs."""
	org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='customers')
	external_id = models.CharField(max_length=255, blank=True, null=True)
	name = models.CharField(max_length=255, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return self.name or (self.external_id or f"Customer {self.pk}")


class Subscription(models.Model):
	"""Normalized subscription/billing snapshot (one row per customer/start-date)."""
	customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='subscriptions')
	mrr = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
	start_date = models.DateField(null=True, blank=True)
	source_upload = models.ForeignKey(UploadedCSV, on_delete=models.SET_NULL, null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		indexes = [
			models.Index(fields=['start_date']),
			models.Index(fields=['mrr']),
		]

	def __str__(self):
		return f"Subscription {self.customer} mrr={self.mrr} start={self.start_date}"


from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver


User = get_user_model()


class UserProfile(models.Model):
	user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
	org = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')

	def __str__(self):
		return f"Profile: {self.user.username}"


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
	if created:
		UserProfile.objects.create(user=instance)


# --- Automations models (MVP scaffolding) ---
class Automation(models.Model):
	"""Represents a user-defined automation composed of triggers and actions.

	For MVP we store a natural_language field and an actions JSON blob that
	describes what to execute. Actions are executed by a Celery task.
	"""
	org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='automations')
	name = models.CharField(max_length=255)
	description = models.TextField(blank=True)
	natural_language = models.TextField(blank=True)
	actions = models.JSONField(default=list, blank=True)
	is_active = models.BooleanField(default=True)
	schedule_text = models.CharField(max_length=255, blank=True, help_text='Human readable schedule (e.g., "every Friday at 09:00")')
	last_run = models.DateTimeField(null=True, blank=True)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	def __str__(self):
		return f"Automation: {self.name} ({self.org})"


class AutomationExecution(models.Model):
	"""Log of automation executions and outcomes."""
	automation = models.ForeignKey(Automation, on_delete=models.CASCADE, related_name='executions')
	started_at = models.DateTimeField(auto_now_add=True)
	finished_at = models.DateTimeField(null=True, blank=True)
	success = models.BooleanField(default=False)
	result = models.JSONField(null=True, blank=True)

	def __str__(self):
		return f"Exec {self.pk} of {self.automation.name} at {self.started_at}"

