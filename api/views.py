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
    authentication_classes = [TokenAuthentication]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        # Simple org scoping: assume user has `profile.org` or use first org
        # For MVP, we will allow listing all uploads (can tighten later)
        return UploadedCSV.objects.filter(uploaded_by=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        org = None
        # For now try to get first org for the user; extend later with real org membership
        org = Organization.objects.first()
        serializer.save(uploaded_by=self.request.user, org=org, filename=getattr(self.request.FILES.get('file'), 'name', 'upload.csv'))


class DashboardListCreateAPIView(ListCreateAPIView):
    serializer_class = DashboardSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get_queryset(self):
        org = Organization.objects.first()
        return Dashboard.objects.filter(org=org).order_by('-updated_at')

    def perform_create(self, serializer):
        org = Organization.objects.first()
        serializer.save(created_by=self.request.user, org=org)


class DashboardDetailAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = DashboardSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get_queryset(self):
        org = Organization.objects.first()
        return Dashboard.objects.filter(org=org)

