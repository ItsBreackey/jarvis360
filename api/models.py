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

