from rest_framework import serializers
from .models import Organization, UploadedCSV, Dashboard
from .models import Automation, AutomationExecution


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug', 'created_at']


class UploadedCSVSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadedCSV
        fields = [
            'id', 'org', 'uploaded_by', 'file', 'filename', 'created_at',
            'status', 'status_started_at', 'completed_at', 'error_message', 'subscriptions_created',
        ]
        # org and uploaded_by are set server-side; make them read-only for client requests
        read_only_fields = ['org', 'uploaded_by', 'created_at', 'status', 'status_started_at', 'completed_at', 'error_message', 'subscriptions_created']


class DashboardSerializer(serializers.ModelSerializer):
    # Allow slug to be optional in requests; server will generate when missing.
    slug = serializers.CharField(required=False, allow_blank=True)
    # Validate visibility against the model's defined choices (private/public).
    # Use the model's VISIBILITY_CHOICES so server-side and serializer choices stay in sync.
    visibility = serializers.ChoiceField(
        choices=Dashboard.VISIBILITY_CHOICES,
        required=False,
        default=Dashboard.VISIBILITY_PRIVATE,
    )
    owner = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = Dashboard
        # include owner (object) and owner_name (string) to help clients display human-friendly owner info
        fields = ['id', 'org', 'name', 'slug', 'visibility', 'created_by', 'owner', 'owner_name', 'config', 'created_at', 'updated_at']
        # org and created_by are assigned by the server during creation
        read_only_fields = ['org', 'created_by', 'created_at', 'updated_at']

    def get_owner(self, obj):
        user = getattr(obj, 'created_by', None)
        if not user:
            return None
        try:
            return {'id': user.id, 'username': getattr(user, 'username', None)}
        except Exception:
            return None

    def get_owner_name(self, obj):
        user = getattr(obj, 'created_by', None)
        if not user:
            return None
        # Prefer full name if available, otherwise username
        try:
            full = getattr(user, 'get_full_name', None)
            if callable(full):
                name = full()
                if name:
                    return name
        except Exception:
            pass
        return getattr(user, 'username', None)


class AutomationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Automation
        fields = ['id', 'org', 'name', 'description', 'natural_language', 'actions', 'is_active', 'schedule_text', 'last_run', 'created_by', 'created_at', 'updated_at']
        read_only_fields = ['org', 'created_by', 'created_at', 'updated_at', 'last_run']


class AutomationExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationExecution
        fields = ['id', 'automation', 'started_at', 'finished_at', 'success', 'result']
        read_only_fields = ['started_at']
