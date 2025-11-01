from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field, OpenApiTypes
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

    # Provide an explicit OpenAPI field for the owner object returned by get_owner
    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_owner(self, obj):
        user = getattr(obj, 'created_by', None)
        if not user:
            return None
        try:
            return {'id': user.id, 'username': getattr(user, 'username', None)}
        except Exception:
            return None

    # Provide an explicit OpenAPI field for owner_name (string)
    @extend_schema_field(OpenApiTypes.STR)
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


class InsightsSerializer(serializers.Serializer):
    """Serializer for the insights/arr-summary output.

    Fields mirror the response from `ARRSummaryAPIView`:
        - arr_kpis: dict with 'MRR' and 'ARR'
        - top_customers: list of dicts
        - cohorts: dict
        - retention_matrix: dict
    """
    arr_kpis = serializers.DictField(child=serializers.FloatField(), required=True)
    top_customers = serializers.ListField(child=serializers.DictField(), required=True)
    cohorts = serializers.DictField(child=serializers.ListField(child=serializers.IntegerField()), required=False)
    retention_matrix = serializers.DictField(child=serializers.DictField(), required=False)


class OverviewResponseSerializer(serializers.Serializer):
    summary = serializers.CharField()
    stats = serializers.DictField(child=serializers.DictField(), required=False)
    sample_chart = serializers.ListField(child=serializers.DictField(), required=False)


class SimulationResponseSerializer(serializers.Serializer):
    summary = serializers.CharField()
    base_metric_name = serializers.CharField()


class AutomationEnqueuedSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    message = serializers.CharField()


class AutomationExecutedSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    result = serializers.DictField(child=serializers.DictField(), required=False)


class UploadedCSVReimportResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    message = serializers.CharField(required=False)
    created = serializers.IntegerField(required=False)
    subscriptions_created = serializers.IntegerField(required=False)


class ForecastResponseSerializer(serializers.Serializer):
    summary = serializers.CharField()
    forecast = serializers.ListField(child=serializers.DictField())


class SimpleOkSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    message = serializers.CharField(required=False)


class LoginResponseSerializer(serializers.Serializer):
    username = serializers.CharField()


class RegisterResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    username = serializers.CharField()
    email = serializers.EmailField()


class PasswordResetRequestResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    reset_url = serializers.CharField(required=False, allow_null=True)


class PasswordResetConfirmResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()


class MeResponseSerializer(serializers.Serializer):
    user = serializers.DictField(child=serializers.CharField(), required=False)
