from rest_framework import serializers
from .models import Organization, UploadedCSV, Dashboard


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug', 'created_at']


class UploadedCSVSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadedCSV
        fields = ['id', 'org', 'uploaded_by', 'file', 'filename', 'created_at']
        read_only_fields = ['uploaded_by', 'created_at']


class DashboardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dashboard
        fields = ['id', 'org', 'name', 'slug', 'created_by', 'config', 'created_at', 'updated_at']
        read_only_fields = ['created_by', 'created_at', 'updated_at']
