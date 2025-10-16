from django.db import models
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

	def __str__(self):
		return f"{self.filename} ({self.org})"


class Dashboard(models.Model):
	"""Saved dashboard configuration per organization."""
	org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='dashboards')
	name = models.CharField(max_length=255)
	slug = models.SlugField(max_length=255)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
	config = models.JSONField(default=dict)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		unique_together = (('org', 'slug'),)

	def __str__(self):
		return f"{self.name} ({self.org})"
