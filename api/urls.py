from django.urls import path, include
from .views import (
    OverviewAPIView,
    SimulationAPIView,
    UploadCSVAPIView,
    DashboardListCreateAPIView,
    DashboardDetailAPIView,
    register_user,
)
from rest_framework.authtoken import views as drf_views
from .views import login_cookie, logout_cookie, me
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from .views import jwt_refresh_cookie, jwt_logout

urlpatterns = [
    # Existing forecast app
    path('forecast/', include('forecast.urls')),

    # Analysis endpoints
    path('overview/', OverviewAPIView.as_view(), name='overview_api'),
    path('simulation/', SimulationAPIView.as_view(), name='simulation_api'),

    # Persistence endpoints
    path('uploads/', UploadCSVAPIView.as_view(), name='uploads'),
    path('dashboards/', DashboardListCreateAPIView.as_view(), name='dashboards'),
    path('dashboards/<int:pk>/', DashboardDetailAPIView.as_view(), name='dashboard-detail'),

    # Auth endpoints
    path('token-auth/', drf_views.obtain_auth_token, name='api-token-auth'),
    path('register/', register_user, name='register'),
    # cookie-based helpers
    path('login-cookie/', login_cookie, name='login-cookie'),
    path('logout-cookie/', logout_cookie, name='logout-cookie'),
    path('me/', me, name='me'),
    path('token/refresh-cookie/', jwt_refresh_cookie, name='jwt-refresh-cookie'),
    path('token/logout/', jwt_logout, name='jwt-logout'),
    # OpenAPI / Swagger
    path('schema/', SpectacularAPIView.as_view(), name='schema'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
