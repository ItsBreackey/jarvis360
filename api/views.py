import pandas as pd
import numpy as np
import io
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.authentication import TokenAuthentication
from .serializers import UploadedCSVSerializer, DashboardSerializer
from .models import UploadedCSV, Dashboard, Organization
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from django.utils.text import slugify
from .auth import CookieTokenAuthentication
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken

User = get_user_model()

logger = logging.getLogger(__name__)

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

class OverviewAPIView(APIView):
    """
    Receives a CSV file and returns descriptive statistics and a chart sample.
    """
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


class SimulationAPIView(APIView):
    """
    Receives a file and returns a brief AI summary for the simulation section.
    This simulates an LLM call to provide context for the simulation parameters.
    """
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
        return Dashboard.objects.filter(org=org).order_by('-updated_at')

    def perform_create(self, serializer):
        profile = getattr(self.request.user, 'profile', None)
        if not profile or not profile.org:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('User must belong to an organization to create dashboards.')
        org = profile.org
        # Auto-generate slug from name if not provided
        slug = serializer.validated_data.get('slug') or None
        if not slug and 'name' in serializer.validated_data:
            slug = slugify(serializer.validated_data['name'])[:250]
        serializer.save(created_by=self.request.user, org=org, slug=slug)


class DashboardDetailAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = DashboardSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieTokenAuthentication]

    def get_queryset(self):
        profile = getattr(self.request.user, 'profile', None)
        if not profile or not profile.org:
            return Dashboard.objects.none()
        org = profile.org
        return Dashboard.objects.filter(org=org)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    """Simple registration endpoint creating a user and optional org."""
    username = request.data.get('username')
    password = request.data.get('password')
    org_name = request.data.get('org_name')
    if not username or not password:
        return Response({'error': 'username and password required'}, status=status.HTTP_400_BAD_REQUEST)
    # Enforce org_name for tenant scoping in this system — if not provided, return helpful error.
    if User.objects.filter(username=username).exists():
        return Response({'error': 'username exists'}, status=status.HTTP_400_BAD_REQUEST)
    user = User.objects.create_user(username=username, password=password)
    if not org_name:
        return Response({'error': 'org_name is required for registration'}, status=status.HTTP_400_BAD_REQUEST)
    slug = slugify(org_name)[:100]
    org, _ = Organization.objects.get_or_create(slug=slug, defaults={'name': org_name})
    profile = getattr(user, 'profile', None)
    if profile:
        profile.org = org
        profile.save()
    token, _ = Token.objects.get_or_create(user=user)
    resp = Response({'token': token.key, 'username': user.username}, status=status.HTTP_201_CREATED)
    # Optionally set cookie-based token for convenience (frontend may request cookie mode)
    if request.data.get('set_cookie'):
        resp.set_cookie('auth_token', token.key, httponly=True, samesite='Lax')
    return resp


@api_view(['POST'])
@permission_classes([AllowAny])
def login_cookie(request):
    """Authenticate by username/password and set an HttpOnly cookie with the token."""
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
    resp.set_cookie('access_token', access_token, httponly=True, samesite='Lax')
    resp.set_cookie('refresh_token', refresh_token, httponly=True, samesite='Lax')
    return resp


@api_view(['POST'])
def logout_cookie(request):
    # Remove cookie
    resp = Response({'ok': True}, status=status.HTTP_200_OK)
    resp.delete_cookie('auth_token')
    return resp


@api_view(['GET'])
def me(request):
    # Allow cookie-based auth by attempting CookieTokenAuthentication
    auth_res = CookieTokenAuthentication().authenticate(request)
    if not auth_res:
        return Response({'user': None}, status=status.HTTP_200_OK)
    user, token = auth_res
    return Response({'user': {'username': user.username}}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def jwt_refresh_cookie(request):
    """Attempt to rotate refresh token from cookie and issue a new access token cookie."""
    refresh_token = request.COOKIES.get('refresh_token')
    if not refresh_token:
        return Response({'error': 'no refresh token'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        refresh = RefreshToken(refresh_token)
        # rotate if configured
        new_refresh = refresh.rotate() if hasattr(refresh, 'rotate') else refresh
        access = str(new_refresh.access_token if hasattr(new_refresh, 'access_token') else refresh.access_token)
        resp = Response({'ok': True}, status=status.HTTP_200_OK)
        resp.set_cookie('access_token', access, httponly=True, samesite='Lax')
        # if rotation produced a new refresh token string, set it
        try:
            resp.set_cookie('refresh_token', str(new_refresh), httponly=True, samesite='Lax')
        except Exception:
            # fallback: keep existing refresh cookie
            pass
        return resp
    except Exception as e:
        logger.exception('refresh failed')
        return Response({'error': 'invalid refresh'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def jwt_logout(request):
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

