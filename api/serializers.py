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
        # org and uploaded_by are set server-side; make them read-only for client requests
        read_only_fields = ['org', 'uploaded_by', 'created_at']


class DashboardSerializer(serializers.ModelSerializer):
    # Allow slug to be optional in requests; server will generate when missing.
    slug = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Dashboard
        fields = ['id', 'org', 'name', 'slug', 'created_by', 'config', 'created_at', 'updated_at']
        # org and created_by are assigned by the server during creation
        read_only_fields = ['org', 'created_by', 'created_at', 'updated_at']
