from django.urls import path
from .views import OverviewAPIView, SimulationAPIView, UploadCSVAPIView, DashboardListCreateAPIView, DashboardDetailAPIView
from rest_framework.authtoken import views as drf_views

urlpatterns = [
    path('overview/', OverviewAPIView.as_view(), name='overview'),
    path('simulation/', SimulationAPIView.as_view(), name='simulation'),
    path('uploads/', UploadCSVAPIView.as_view(), name='uploads'),
    path('dashboards/', DashboardListCreateAPIView.as_view(), name='dashboards'),
    path('dashboards/<int:pk>/', DashboardDetailAPIView.as_view(), name='dashboard-detail'),
    path('token-auth/', drf_views.obtain_auth_token, name='api-token-auth'),
]
from django.urls import path, include
from .views import OverviewAPIView, SimulationAPIView

urlpatterns = [
    # Existing forecast app
    path('forecast/', include('forecast.urls')),

    # Consolidated analysis endpoints (moved into the api app)
    path('overview/', OverviewAPIView.as_view(), name='overview_api'),
    path('simulation/', SimulationAPIView.as_view(), name='simulation_api'),
]
