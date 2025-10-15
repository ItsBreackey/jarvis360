from django.urls import path, include
from .views import OverviewAPIView, SimulationAPIView

urlpatterns = [
    # Existing forecast app
    path('forecast/', include('forecast.urls')),

    # Consolidated analysis endpoints (moved into the api app)
    path('overview/', OverviewAPIView.as_view(), name='overview_api'),
    path('simulation/', SimulationAPIView.as_view(), name='simulation_api'),
]
