from django.urls import path
from .views import ForecastAPIView

urlpatterns = [
    # Removed the trailing slash from the original to match the client path
    path('', ForecastAPIView.as_view(), name='forecast'), 
]
