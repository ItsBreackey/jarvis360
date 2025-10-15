import os
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import UploadedDataset, ForecastResult
from .utils.forecast_engine import generate_forecast
from .utils.ai_summary import generate_ai_summary

# Configure logging for debugging
logger = logging.getLogger(__name__)
# The TestAPIView was not used, so removing it to clean up the code.

class ForecastAPIView(APIView):
    """
    Handles CSV file upload and generates forecast + AI summary.
    """

    def post(self, request):
        # Check if file is provided
        file = request.FILES.get('file')
        periods_str = request.POST.get('periods', '30')
        
        if not file:
            logger.warning("No file received in request.")
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            periods = int(periods_str)
        except ValueError:
            return Response({"error": "Invalid value for periods."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Save uploaded dataset (optional, but good for history/debugging)
            name = file.name
            dataset = UploadedDataset.objects.create(name=name, file=file)
            logger.info(f"File received: {name}")

            # Generate forecast
            forecast_data = generate_forecast(dataset.file.path, periods=periods)
            logger.info(f"Forecast generated with {len(forecast_data)} periods.")

            # Generate AI summary
            summary = generate_ai_summary(forecast_data)
            logger.info(f"Summary generated: {summary}")

            # Save forecast result
            result = ForecastResult.objects.create(
                dataset=dataset,
                forecast_data=forecast_data,
                summary=summary
            )
            logger.info(f"ForecastResult saved: {result.id}")

            # Return JSON response
            return Response({
                "summary": summary,
                "forecast": forecast_data
            }, status=status.HTTP_200_OK)

        except ValueError as ve:
            # Catch specific data validation errors from the engine
            logger.error(f"Data Validation Error: {ve}", exc_info=True)
            return Response({"error": str(ve)}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.error(f"Error processing forecast: {e}", exc_info=True)
            return Response({"error": "An internal error occurred during forecasting."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
