from django.contrib import admin
from .models import Organization, UploadedCSV, Dashboard


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
	list_display = ('id', 'name', 'slug', 'created_at')


@admin.register(UploadedCSV)
class UploadedCSVAdmin(admin.ModelAdmin):
	list_display = ('id', 'filename', 'org', 'uploaded_by', 'created_at')


@admin.register(Dashboard)
class DashboardAdmin(admin.ModelAdmin):
	list_display = ('id', 'name', 'org', 'created_by', 'updated_at')

from django.contrib import admin

# Register your models here.
