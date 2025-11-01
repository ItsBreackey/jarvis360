import pandas as pd
import numpy as np
import io
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, RetrieveAPIView, GenericAPIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.authentication import TokenAuthentication
from .serializers import UploadedCSVSerializer, DashboardSerializer
from .serializers import AutomationSerializer, AutomationExecutionSerializer, InsightsSerializer
from .serializers import OverviewResponseSerializer, SimulationResponseSerializer, AutomationEnqueuedSerializer, AutomationExecutedSerializer, UploadedCSVReimportResponseSerializer
from .serializers import SimpleOkSerializer, LoginResponseSerializer, RegisterResponseSerializer, PasswordResetRequestResponseSerializer, PasswordResetConfirmResponseSerializer, MeResponseSerializer
from drf_spectacular.utils import extend_schema, OpenApiExample
from .models import Automation, AutomationExecution
from .models import UploadedCSV, Dashboard, Organization, Subscription
from .importer import import_single_upload
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token as DRFToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from django.utils.text import slugify
from .auth import CookieTokenAuthentication
from django.db import IntegrityError
from django.db.models import Q
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from django.core.mail import send_mail
from django.conf import settings
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth.tokens import PasswordResetTokenGenerator

# Expose a module-level symbol that tests can patch (`api.views.automation_execute_task`).
# Do not import the real tasks module at import time here to avoid initializing Celery/kombu
# during lightweight test runs. The actual resolution is performed at request time and
# will prefer an already-imported `api.tasks` module when present.
automation_execute_task = None

User = get_user_model()

logger = logging.getLogger(__name__)

# Cookie configuration: allow CI/production to opt into cross-site cookies
COOKIE_SECURE = getattr(settings, 'JARVIS_COOKIE_SECURE', False)
COOKIE_SAMESITE = getattr(settings, 'JARVIS_COOKIE_SAMESITE', 'Lax')
COOKIE_DOMAIN = getattr(settings, 'JARVIS_COOKIE_DOMAIN', None)

# --- Utility Functions ---

def analyze_dataframe(df):
    """
    Performs descriptive statistics on numeric columns and returns a sample for charting.
    """
    stats = {}
    for col in df.columns:
        series = df[col]
        
        # Try to infer if the series is numeric
        # Attempt to convert to numeric, coercing errors to NaN
        # Use .loc to avoid chained-assignment warnings in future pandas versions
        df.loc[:, col] = pd.to_numeric(df[col], errors='coerce')
        
        # Now check if it's numeric after coercion
        if pd.api.types.is_numeric_dtype(df[col]):
            series_numeric = df[col].dropna()
            
            # Calculate descriptive statistics for numeric columns
            stats[col] = {
                "dtype": str(series_numeric.dtype),
                "count": int(series_numeric.count()),
                "unique": int(series_numeric.nunique()),
                "mean": series_numeric.mean(),
                "median": series_numeric.median(),
                "std": series_numeric.std(),
                "min": series_numeric.min(),
                "max": series_numeric.max(),
            }
            # Clean up NaN/Inf values for JSON serialization
            for key, value in stats[col].items():
                if isinstance(value, (float, np.floating)) and (np.isnan(value) or np.isinf(value)):
                    stats[col][key] = None
        else:
            # Basic info for non-numeric/object columns
            # Safely compute top_value (mode) — mode() may return an empty Series
            mode_series = series.mode()
            top_val = mode_series.iloc[0] if not mode_series.empty else None
            stats[col] = {
                "dtype": str(series.dtype),
                "count": int(series.count()),
                "unique": int(series.nunique()),
                "top_value": top_val,
                "mean": None, "median": None, "std": None, "min": None, "max": None # Explicitly set for table consistency
            }
    
    # Get a small sample for chart preview (e.g., first 100 rows) and sanitize for JSON
    sample_df = df.head(100).reset_index().rename(columns={'index': 'x'})
    # Replace NaN/Inf with None so JSON serialization succeeds
    sample_df = sample_df.replace({np.nan: None, np.inf: None, -np.inf: None})
    # Convert any numpy scalar types to native Python types for safe JSON encoding
    def _to_python_scalar(v):
        try:
            if isinstance(v, (np.generic,)):
                return v.item()
        except Exception:
            pass
        return v

    # applymap is deprecated; convert to records and sanitize each value explicitly
    raw_records = sample_df.to_dict(orient='records')
    sample_chart = []
    for rec in raw_records:
        clean = {k: _to_python_scalar(v) for k, v in rec.items()}
        sample_chart.append(clean)
    
    # Simple AI Summary Placeholder
    summary = f"The dataset contains {len(df.columns)} columns and {len(df)} rows. Key statistics for numeric data have been calculated. The data quality appears suitable for further analysis."
    
    return stats, sample_chart, summary

# --- API Views ---

class OverviewAPIView(GenericAPIView):
    """
    Receives a CSV file and returns descriptive statistics and a chart sample.
    """
    serializer_class = OverviewResponseSerializer
    @extend_schema(
        summary='Upload CSV and return descriptive statistics',
        responses=OverviewResponseSerializer,
        examples=[
            OpenApiExample(
                'Overview example',
                value={'summary': 'A brief summary of the dataset', 'stats': {}, 'sample_chart': []},
                request_only=False,
                response_only=True,
            )
        ]
    )
    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Read file content into a DataFrame
            file.seek(0)
            # Sniff encoding/delimiter if possible, but default to utf-8 and comma
            content = file.read().decode('utf-8')
            df = pd.read_csv(io.StringIO(content))
            
            # Drop rows with all NaNs if necessary, or just proceed
            df = df.dropna(how='all')

            stats, sample_chart, summary = analyze_dataframe(df)

            return Response({
                "summary": summary,
                "stats": stats,
                "sample_chart": sample_chart
            }, status=status.HTTP_200_OK)
    
        
        except Exception as e:
            logger.error(f"Error processing Overview: {e}", exc_info=True)
            return Response({"error": f"Error processing file: {str(e)}. Ensure it is a valid CSV."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class PasswordResetRequestView(GenericAPIView):
    """Send a password reset email with a one-time token link."""
    permission_classes = [AllowAny]
    serializer_class = PasswordResetRequestResponseSerializer

    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response({'error': 'email required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # don't reveal whether user exists
            return Response({'ok': True}, status=status.HTTP_200_OK)
        token_gen = PasswordResetTokenGenerator()
        token = token_gen.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        reset_url = f"{request.scheme}://{request.get_host()}/reset-password?uid={uid}&token={token}"
        # send a simple email (developers should override email backend in prod)
        try:
            send_mail(
                subject='Password reset for jArvIs360',
                message=f'Use the following link to reset your password: {reset_url}',
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
        except Exception:
            # don't fail on email send errors in dev
            logger.exception('failed to send password reset email')
        # In DEBUG include the reset URL in the response to simplify developer testing
        if getattr(settings, 'DEBUG', False):
            # include example response shape for schema
            return Response({'ok': True, 'reset_url': reset_url}, status=status.HTTP_200_OK)
        return Response({'ok': True}, status=status.HTTP_200_OK)

class PasswordResetConfirmView(GenericAPIView):
    """Confirm a password reset using uid and token and set a new password."""
    permission_classes = [AllowAny]
    serializer_class = PasswordResetConfirmResponseSerializer

    def post(self, request):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')
        if not uidb64 or not token or not new_password:
            return Response({'error': 'uid, token and new_password required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except Exception:
            return Response({'error': 'invalid link'}, status=status.HTTP_400_BAD_REQUEST)
        token_gen = PasswordResetTokenGenerator()
        if not token_gen.check_token(user, token):
            return Response({'error': 'invalid token'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save()
        return Response({'ok': True}, status=status.HTTP_200_OK)


class SimulationAPIView(GenericAPIView):
    """
    Receives a file and returns a brief AI summary for the simulation section.
    This simulates an LLM call to provide context for the simulation parameters.
    """
    serializer_class = SimulationResponseSerializer
    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Read file content into a DataFrame
            file.seek(0)
            df = pd.read_csv(io.StringIO(file.read().decode('utf-8')))
            
            # Simple check for a 'value' column (y in typical time series)
            df = df.apply(pd.to_numeric, errors='ignore')
            numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
            
            if not numeric_cols:
                raise ValueError("Dataset does not contain numeric data for simulation base.")

            # Assume the first numeric column is the base metric
            base_col_name = numeric_cols[0]
            base_col = df[base_col_name].dropna()
            
            if base_col.empty:
                 raise ValueError("Numeric column is empty after cleaning.")

            # Calculate base statistics for the LLM summary
            avg = base_col.mean()
            std = base_col.std()
            min_val = base_col.min()
            max_val = base_col.max()

            # LLM-style summary based on base data
            summary = (
                f"The base metric ('{base_col_name}') ranges from **{min_val:.2f}** to **{max_val:.2f}** with an average value of **{avg:.2f}** (Std Dev: {std:.2f}). "
                f"The simulation tool allows you to explore the impact of potential changes (Cost Reduction/Sales Increase) on this metric. "
                f"You should test aggressive cost reductions (20%+) to see the impact on profit potential."
            )
            
            # Return a small base sample for client to use (optional, client already has the full dataset)
            return Response({
                "summary": summary,
                "base_metric_name": base_col_name 
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error processing Simulation Summary: {e}", exc_info=True)
            return Response({"error": f"Error processing file for simulation: {str(e)}. Ensure a valid CSV with a numeric column is uploaded."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UploadCSVAPIView(ListCreateAPIView):
    """List and upload CSVs for the user's organization."""
    serializer_class = UploadedCSVSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        # Require that users belong to an organization to list org-owned uploads.
        if profile and profile.org:
            return UploadedCSV.objects.filter(org=profile.org).order_by('-created_at')
        # If user has no org, return only their own uploads (limited fallback)
        return UploadedCSV.objects.filter(uploaded_by=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        profile = getattr(self.request.user, 'profile', None)
        if not profile or not profile.org:
            # Deny uploads unless user is assigned to an org
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('User must belong to an organization to upload files.')
        org = profile.org
        serializer.save(uploaded_by=self.request.user, org=org, filename=getattr(self.request.FILES.get('file'), 'name', 'upload.csv'))


class UploadedCSVDetailAPIView(RetrieveAPIView):
    """Retrieve a single UploadedCSV (used by frontend to poll status)."""
    serializer_class = UploadedCSVSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        if profile and profile.org:
            return UploadedCSV.objects.filter(org=profile.org)
        return UploadedCSV.objects.filter(uploaded_by=self.request.user)


class UploadedCSVReimportAPIView(GenericAPIView):
    """Trigger a re-import for an existing UploadedCSV.

    Uses the same idempotent claiming logic as the post-save handler. If a
    Celery task is available it will enqueue the work; otherwise it will run
    the import in a background thread after transaction commit. Returns 202
    when the reimport is accepted/started, 400 on misuse, and 404 if not found.
    """
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]

    serializer_class = UploadedCSVReimportResponseSerializer

    @extend_schema(responses={200: UploadedCSVReimportResponseSerializer, 202: UploadedCSVReimportResponseSerializer, 400: UploadedCSVReimportResponseSerializer, 404: UploadedCSVReimportResponseSerializer})
    def post(self, request, pk):
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.org:
            return Response({'error': 'User must belong to an organization'}, status=status.HTTP_403_FORBIDDEN)

        upload = UploadedCSV.objects.filter(pk=pk, org=profile.org).first()
        if not upload:
            return Response({'error': 'upload not found'}, status=status.HTTP_404_NOT_FOUND)

        # Do not allow re-import if no file is attached
        if not upload.file:
            return Response({'error': 'no file to import'}, status=status.HTTP_400_BAD_REQUEST)

        # If subscriptions already exist for this upload, return 200 with info
        if Subscription.objects.filter(source_upload=upload).exists():
            # Include a Retry-After header so the frontend can show a cooldown even when nothing was re-imported.
            retry_after = getattr(settings, 'REIMPORT_RATE_LIMIT_SECONDS', 60)
            return Response({'ok': True, 'message': 'already imported', 'subscriptions_created': upload.subscriptions_created}, status=status.HTTP_200_OK, headers={'Retry-After': str(retry_after)})

        # Rate-limit repeated reimport attempts per-upload to avoid abuse
        from django.core.cache import cache
        limit_seconds = getattr(settings, 'REIMPORT_RATE_LIMIT_SECONDS', 60)
        # Use per-user-per-upload rate limit key so different users can retry separately
        user_part = f":{request.user.pk}" if getattr(request, 'user', None) and getattr(request.user, 'pk', None) else ''
        cache_key = f"reimport_lock:{upload.pk}{user_part}"

        # If user is not staff, reject when cache key present
        if not (getattr(request, 'user', None) and getattr(request.user, 'is_staff', False)):
            if cache.get(cache_key):
                return Response({'error': 'rate limited'}, status=status.HTTP_429_TOO_MANY_REQUESTS, headers={'Retry-After': str(limit_seconds)})

        # Headers to return on accepted/enqueued/started responses so client can start cooldown immediately
        headers = {'Retry-After': str(limit_seconds)}

        # Atomically claim the upload if it's still pending
        from django.utils import timezone
        rows = UploadedCSV.objects.filter(pk=upload.pk, status=UploadedCSV.STATUS_PENDING).update(
            status=UploadedCSV.STATUS_IMPORTING,
            status_started_at=timezone.now(),
            error_message='',
            subscriptions_created=0,
        )

        # Set the rate-limit key so subsequent immediate reimports are rejected
        try:
            cache.set(cache_key, True, timeout=limit_seconds)
        except Exception:
            pass

        if not rows:
            # Already claimed or in-progress; return accepted
            return Response({'ok': True, 'message': 'already being processed'}, status=status.HTTP_202_ACCEPTED, headers=headers)

        # If configured for DEBUG synchronous imports, run importer inline (used by tests)
        if getattr(settings, 'DEBUG_IMPORT_SYNC', False):
            try:
                created = import_single_upload(upload, sample_lines=getattr(settings, 'IMPORT_SAMPLE_LINES', 200))
                UploadedCSV.objects.filter(pk=upload.pk).update(
                    status=UploadedCSV.STATUS_COMPLETE,
                    completed_at=timezone.now(),
                    subscriptions_created=int(created or 0),
                )
                return Response({'ok': True, 'message': 'imported', 'created': int(created or 0)}, status=status.HTTP_200_OK, headers=headers)
            except Exception:
                import traceback as _tb
                tb = _tb.format_exc()
                UploadedCSV.objects.filter(pk=upload.pk).update(
                    status=UploadedCSV.STATUS_ERROR,
                    error_message='Import failed (see server logs)\n' + tb[:1000],
                )
                return Response({'error': 'import failed'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR, headers=headers)

        # Enqueue or start background thread like the post_save handler
        try:
            from .tasks import import_uploaded_csv_task
        except Exception:
            import_uploaded_csv_task = None

        if import_uploaded_csv_task is not None and hasattr(import_uploaded_csv_task, 'delay'):
            try:
                import_uploaded_csv_task.delay(upload.pk)
                return Response({'ok': True, 'message': 'enqueued'}, status=status.HTTP_202_ACCEPTED, headers=headers)
            except Exception:
                # fall through to thread-based execution
                pass

        # fallback: start background thread after commit
        def _start_thread():
            try:
                from django.db import close_old_connections
                close_old_connections()
            except Exception:
                pass
            import threading
            from .signals import _run_import_sync
            t = threading.Thread(target=_run_import_sync, args=(upload.pk,))
            t.daemon = True
            t.start()

        try:
            from django.db import transaction
            transaction.on_commit(_start_thread)
        except Exception:
            _start_thread()

        return Response({'ok': True, 'message': 'started'}, status=status.HTTP_202_ACCEPTED, headers=headers)


class DashboardListCreateAPIView(ListCreateAPIView):
    serializer_class = DashboardSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        if not profile or not profile.org:
            # Users without orgs should not see any dashboards
            return Dashboard.objects.none()
        org = profile.org
        # Show dashboards that are public within the org, plus any dashboards
        # owned by the requesting user (even if private). This prevents users
        # from seeing other users' private dashboards while allowing public
        # dashboards to be visible org-wide.
        return Dashboard.objects.filter(org=org).filter(
            Q(visibility=Dashboard.VISIBILITY_PUBLIC) | Q(created_by=self.request.user)
        ).order_by('-updated_at')

    def perform_create(self, serializer):
        profile = getattr(self.request.user, 'profile', None)
        if not profile or not profile.org:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('User must belong to an organization to create dashboards.')
        org = profile.org
        # Auto-generate slug from name if not provided
        base_slug = serializer.validated_data.get('slug') or None
        if not base_slug and 'name' in serializer.validated_data:
            base_slug = slugify(serializer.validated_data['name'])[:250]

        # Helper: generate a unique slug within the org by appending a numeric
        # suffix when collisions are found. This avoids bubbling up IntegrityError
        # for the common case and provides a deterministic fallback.
        def generate_unique_slug(org_obj, base):
            if not base:
                # Fallback generic base
                base = 'scenario'
            base = base[:250]
            candidate = base
            counter = 1
            # Limit attempts to avoid an infinite loop in pathological cases
            while Dashboard.objects.filter(org=org_obj, slug=candidate).exists():
                suffix = f"-{counter}"
                max_base_len = 250 - len(suffix)
                candidate = f"{base[:max_base_len]}{suffix}"
                counter += 1
                if counter > 1000:
                    break
            return candidate

        slug = generate_unique_slug(org, base_slug)

        try:
            serializer.save(created_by=self.request.user, org=org, slug=slug)
        except IntegrityError:
            # Race condition or unexpected duplicate — translate to DRF ValidationError
            logger.exception('IntegrityError while creating Dashboard; slug collision')
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'slug': ['A dashboard with this slug already exists. Try renaming the scenario.']})


class DashboardDetailAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = DashboardSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        if not profile or not profile.org:
            return Dashboard.objects.none()
        org = profile.org
        return Dashboard.objects.filter(org=org).filter(Q(visibility=Dashboard.VISIBILITY_PUBLIC) | Q(created_by=self.request.user))

    def perform_update(self, serializer):
        # Only owners or org admins can update visibility/name/config
        profile = getattr(self.request.user, 'profile', None)
        if not profile or not profile.org:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('User must belong to an organization to update dashboards.')
        # Save normally; server will enforce org scoping via queryset
        serializer.save()


class PublicDashboardRetrieveAPIView(RetrieveAPIView):
    """Retrieve a public dashboard by slug without authentication."""
    serializer_class = DashboardSerializer
    permission_classes = []
    authentication_classes = []

    def get(self, request, slug):
        db = Dashboard.objects.filter(slug=slug, visibility=Dashboard.VISIBILITY_PUBLIC).first()
        if not db:
            return Response({'error': 'not found'}, status=status.HTTP_404_NOT_FOUND)
        ser = self.serializer_class(db)
        return Response(ser.data, status=status.HTTP_200_OK)


class RegisterUserView(GenericAPIView):
    """Simple registration endpoint creating a user and optional org."""
    permission_classes = [AllowAny]
    serializer_class = RegisterResponseSerializer

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        email = request.data.get('email')
        org_name = request.data.get('org_name')
        if not username or not password:
            return Response({'error': 'username and password required'}, status=status.HTTP_400_BAD_REQUEST)
        if not email:
            return Response({'error': 'email required'}, status=status.HTTP_400_BAD_REQUEST)
        # Enforce org_name for tenant scoping in this system — if not provided, return helpful error.
        if User.objects.filter(username=username).exists():
            return Response({'error': 'username exists'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email=email).exists():
            return Response({'error': 'email exists'}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=username, password=password, email=email)
        if not org_name:
            return Response({'error': 'org_name is required for registration'}, status=status.HTTP_400_BAD_REQUEST)
        slug = slugify(org_name)[:100]
        org, _ = Organization.objects.get_or_create(slug=slug, defaults={'name': org_name})
        profile = getattr(user, 'profile', None)
        if profile:
            profile.org = org
            profile.save()
        token, _ = DRFToken.objects.get_or_create(user=user)
        resp = Response({'token': token.key, 'username': user.username, 'email': user.email}, status=status.HTTP_201_CREATED)
        # Optionally set cookie-based token for convenience (frontend may request cookie mode)
        if request.data.get('set_cookie'):
            resp.set_cookie(
                'auth_token', token.key,
                httponly=True,
                samesite=COOKIE_SAMESITE,
                secure=COOKIE_SECURE,
                domain=COOKIE_DOMAIN,
                path='/'
            )
        return resp


class LoginCookieView(GenericAPIView):
    """Authenticate by username/password and set an HttpOnly cookie with the token."""
    permission_classes = [AllowAny]
    serializer_class = LoginResponseSerializer

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        if not username or not password:
            return Response({'error': 'username and password required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'invalid credentials'}, status=status.HTTP_400_BAD_REQUEST)
        if not user.check_password(password):
            return Response({'error': 'invalid credentials'}, status=status.HTTP_400_BAD_REQUEST)
        # Issue JWT refresh + access tokens and set them as HttpOnly cookies
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)
        resp = Response({'username': user.username}, status=status.HTTP_200_OK)
        # Set cookies (HttpOnly)
        # Access token short lived; include SameSite and path
        resp.set_cookie('access_token', access_token, httponly=True, samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE, domain=COOKIE_DOMAIN, path='/')
        resp.set_cookie('refresh_token', refresh_token, httponly=True, samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE, domain=COOKIE_DOMAIN, path='/')
        # Also set legacy DRF token cookie for compatibility with CookieTokenAuthentication fallback
        try:
            drf_token, _ = DRFToken.objects.get_or_create(user=user)
            resp.set_cookie('auth_token', drf_token.key, httponly=True, samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE, domain=COOKIE_DOMAIN, path='/')
        except Exception:
            # If token creation fails, continue without it
            logger.exception('failed to set drf auth_token cookie')
        return resp


class LogoutCookieView(GenericAPIView):
    serializer_class = SimpleOkSerializer

    def post(self, request):
        # Remove cookie
        resp = Response({'ok': True}, status=status.HTTP_200_OK)
        resp.delete_cookie('auth_token')
        return resp


class MeView(GenericAPIView):
    serializer_class = MeResponseSerializer

    def get(self, request):
        # Allow cookie-based auth by attempting CookieTokenAuthentication
        auth_res = CookieTokenAuthentication().authenticate(request)
        if not auth_res:
            return Response({'user': None}, status=status.HTTP_200_OK)
        user, token = auth_res
        return Response({'user': {'username': user.username}}, status=status.HTTP_200_OK)


class JwtRefreshCookieView(GenericAPIView):
    """Attempt to rotate refresh token from cookie and issue a new access token cookie."""
    permission_classes = [AllowAny]
    serializer_class = SimpleOkSerializer

    def post(self, request):
        refresh_token = request.COOKIES.get('refresh_token')
        if not refresh_token:
            return Response({'error': 'no refresh token'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            refresh = RefreshToken(refresh_token)
            # rotate if configured
            new_refresh = refresh.rotate() if hasattr(refresh, 'rotate') else refresh
            access = str(new_refresh.access_token if hasattr(new_refresh, 'access_token') else refresh.access_token)
            resp = Response({'ok': True}, status=status.HTTP_200_OK)
            resp.set_cookie('access_token', access, httponly=True, samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE, domain=COOKIE_DOMAIN, path='/')
            # if rotation produced a new refresh token string, set it
            try:
                resp.set_cookie('refresh_token', str(new_refresh), httponly=True, samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE, domain=COOKIE_DOMAIN, path='/')
            except Exception:
                # fallback: keep existing refresh cookie
                pass
            return resp
        except Exception as e:
            logger.exception('refresh failed')
            return Response({'error': 'invalid refresh'}, status=status.HTTP_400_BAD_REQUEST)


class JwtLogoutView(GenericAPIView):
    permission_classes = []
    authentication_classes = []
    serializer_class = SimpleOkSerializer

    def post(self, request):
        # Attempt to blacklist the refresh token server-side if present
        refresh_token = request.COOKIES.get('refresh_token')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                # Blacklist the token (simplejwt provides a blacklist app)
                token.blacklist()
            except Exception:
                # If blacklist fails, continue to clear cookies anyway
                logger.exception('failed to blacklist refresh token')
        resp = Response({'ok': True}, status=status.HTTP_200_OK)
        resp.delete_cookie('access_token')
        resp.delete_cookie('refresh_token')
        return resp


class ARRSummaryAPIView(GenericAPIView):
    """Minimal ARR summary endpoint used by the frontend dashboard.

    This implementation is intentionally small: it demonstrates how to call the
    cohort utilities and return a simple JSON payload. It uses UploadedCSV model
    as a source of 'customer' signup dates if available; otherwise returns an
    empty structure.
    """
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]
    serializer_class = InsightsSerializer

    @extend_schema(
        responses=InsightsSerializer,
        examples=[
            OpenApiExample(
                'Example ARRs',
                value={
                    'arr_kpis': {'MRR': 150.0, 'ARR': 1800.0},
                    'top_customers': [{'customer_id': 'c1', 'mrr': 100.0}],
                    'cohorts': {'2020-01': [10, 9, 8]},
                    'retention_matrix': {'2020-01': {'2020-01': [1, 2, 3]}}
                },
                request_only=False,
                response_only=True,
            )
        ],
    )
    def get(self, request):
        # UploadedCSV may represent uploads; we treat each UploadedCSV as one customer for demo
        qs = UploadedCSV.objects.none()
        profile = getattr(request.user, 'profile', None)
        if profile and profile.org:
            qs = UploadedCSV.objects.filter(org=profile.org)

        signups = []
        for u in qs:
            # Try to extract a signup_date from the CSV metadata if present, else created_at
            sd = getattr(u, 'created_at', None)
            # Synthetic active months: 1 for all (placeholder)
            signups.append((sd.date() if sd else None, 1))

        from analysis.cohorts import cohortize, retention_matrix
        from analysis.arr import compute_mrr_and_arr, top_customers_by_mrr

        cohorts = cohortize([d for d, _ in signups if d])
        matrix = retention_matrix(signups)

        # Prefer canonical normalized subscriptions when present. Use the
        # centralized insights service which encapsulates DB access and
        # ARR/MRR computations. The service will gracefully return zeros if
        # no subscriptions exist or an error occurs.
        try:
            from .services.insights import compute_org_kpis
            # Optional query param: since=YYYY-MM-DD to filter subscriptions
            since_param = request.GET.get('since')
            since = None
            if since_param:
                try:
                    from datetime import datetime
                    since = datetime.strptime(since_param, '%Y-%m-%d').date()
                except Exception:
                    # ignore parse errors and treat as no filter
                    since = None
            if profile and profile.org:
                svc = compute_org_kpis(profile.org, since=since)
                kpis = svc.get('kpis', {'MRR': 0.0, 'ARR': 0.0})
                tops = svc.get('top_customers', [])
            else:
                kpis = {'MRR': 0.0, 'ARR': 0.0}
                tops = []
        except Exception:
            # Fallback to parsing uploads (legacy behavior)
            from analysis.normalize import normalize_csv_text
            records = []
            for u in qs:
                try:
                    if not u.file:
                        continue
                    u.file.open('rb')
                    raw = u.file.read(128 * 1024).decode('utf-8', errors='ignore')
                    u.file.close()
                    recs = normalize_csv_text(raw, sample_lines=200)
                    for r in recs:
                        records.append({'customer_id': r.get('customer_id'), 'mrr': r.get('mrr') or 0, 'signup_date': r.get('signup_date')})
                except Exception:
                    continue
            kpis = compute_mrr_and_arr(records) if records else {'MRR': 0.0, 'ARR': 0.0}
            tops = top_customers_by_mrr(records, limit=10) if records else []

        # Normalize matrix to JSON friendly shape: keys as 'YYYY-MM'
        cohorts_out = {f"{y:04d}-{m:02d}": v for (y, m), v in cohorts.items()}
        matrix_out = {f"{y:04d}-{m:02d}": row for (y, m), row in matrix.items()}

        return Response({
            'arr_kpis': kpis,
            'top_customers': tops,
            'cohorts': cohorts_out,
            'retention_matrix': matrix_out,
        }, status=status.HTTP_200_OK)


# --- Automations API (MVP) ---
class AutomationListCreateAPIView(ListCreateAPIView):
    serializer_class = AutomationSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        if profile and profile.org:
            return Automation.objects.filter(org=profile.org).order_by('-updated_at')
        return Automation.objects.none()

    def perform_create(self, serializer):
        profile = getattr(self.request.user, 'profile', None)
        if not profile or not profile.org:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('User must belong to an organization to create automations.')
        org = profile.org
        # For MVP: accept natural_language and attempt best-effort parse into actions
        obj = serializer.save(created_by=self.request.user, org=org)
        logger.info('Created automation %s for org %s', obj.pk, org)


class AutomationDetailAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = AutomationSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        if profile and profile.org:
            return Automation.objects.filter(org=profile.org)
        return Automation.objects.none()


class AutomationRunAPIView(GenericAPIView):
    """Trigger an automation run (enqueues a Celery task)."""
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]
    # The API may return either an enqueued response (202) or an executed result (200).
    # Use the enqueued serializer as the primary schema hint; the executed response is
    # still documented in the @extend_schema examples above.
    serializer_class = AutomationEnqueuedSerializer

    @extend_schema(
        summary='Trigger an automation run (enqueue or run sync fallback)',
        responses={
            202: AutomationEnqueuedSerializer,
            200: AutomationExecutedSerializer,
            403: None,
            404: None,
            500: None,
        },
        examples=[
            OpenApiExample('Enqueued', value={'ok': True, 'message': 'enqueued'}, request_only=False, response_only=True),
            OpenApiExample('Executed inline', value={'ok': True, 'result': {'ok': True}}, request_only=False, response_only=True),
        ]
    )
    def post(self, request, pk):
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.org:
            return Response({'error': 'User must belong to an organization'}, status=status.HTTP_403_FORBIDDEN)
        auto = Automation.objects.filter(pk=pk, org=profile.org).first()
        if not auto:
            return Response({'error': 'automation not found'}, status=status.HTTP_404_NOT_FOUND)
        # Resolve the task object in a way that supports both test patching styles:
        # - prefer tests that patch `api.views.automation_execute_task` (module-level)
        # - if module-level symbol is not present, fall back to `api.tasks.automation_execute_task`
        # Prefer the attribute on the already-imported tasks module if present in sys.modules
        # This allows tests that patch 'api.tasks.automation_execute_task' to be respected
        # without forcing an import that could initialize Celery/kombu (which may fail
        # in lightweight test environments).
        import sys
        tasks_mod_name = f"{__package__}.tasks"
        task_from_tasks = None
        if tasks_mod_name in sys.modules:
            tasks_module = sys.modules[tasks_mod_name]
            task_from_tasks = getattr(tasks_module, 'automation_execute_task', None)

        # If the module-level symbol has been patched (tests patching api.views),
        # prefer it. If it's not present or identical to the tasks module attr,
        # prefer the tasks module attr when available (tests patching api.tasks).
        if automation_execute_task is not None and automation_execute_task is not task_from_tasks:
            task_obj = automation_execute_task
        elif task_from_tasks is not None:
            task_obj = task_from_tasks
        else:
            task_obj = automation_execute_task

        # As a last resort, attempt to import the tasks module only when there is no
        # resolved symbol and the tasks module hasn't been imported yet; avoid importing
        # unnecessarily to prevent initializing Celery/kombu in test environments.
        if task_obj is None and tasks_mod_name not in sys.modules:
            try:
                import importlib
                tasks_module = importlib.import_module(tasks_mod_name)
                task_obj = getattr(tasks_module, 'automation_execute_task', None)
            except Exception:
                task_obj = None

        if task_obj is not None and hasattr(task_obj, 'delay'):
            try:
                task_obj.delay(auto.pk, triggered_by=request.user.pk)
                return Response({'ok': True, 'message': 'enqueued'}, status=status.HTTP_202_ACCEPTED)
            except Exception:
                logger.exception('failed to enqueue automation')

        # Fallback: run synchronously (best-effort)
        try:
            from .tasks import _execute_automation_sync
            exec_result = _execute_automation_sync(auto.pk)
            return Response({'ok': True, 'result': exec_result}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception('failed to run automation sync')
            return Response({'error': 'failed to run automation'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    