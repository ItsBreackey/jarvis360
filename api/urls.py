from django.urls import path, include
from .views import (
    OverviewAPIView,
    SimulationAPIView,
    UploadCSVAPIView,
    UploadedCSVDetailAPIView,
    UploadedCSVReimportAPIView,
    DashboardListCreateAPIView,
    DashboardDetailAPIView,
    PublicDashboardRetrieveAPIView,
    RegisterUserView,
    ARRSummaryAPIView,
    AutomationListCreateAPIView,
    AutomationDetailAPIView,
    AutomationRunAPIView,
)
from rest_framework.authtoken import views as drf_views
from .views import PasswordResetRequestView, PasswordResetConfirmView
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from .views import JwtRefreshCookieView, JwtLogoutView, LoginCookieView, LogoutCookieView, MeView

urlpatterns = [
    # Existing forecast app
    path('forecast/', include('forecast.urls')),

    # Analysis endpoints
    path('overview/', OverviewAPIView.as_view(), name='overview_api'),
    path('simulation/', SimulationAPIView.as_view(), name='simulation_api'),

    # Persistence endpoints
    path('uploads/', UploadCSVAPIView.as_view(), name='uploads'),
    path('uploads/<int:pk>/', UploadedCSVDetailAPIView.as_view(), name='upload-detail'),
    path('uploads/<int:pk>/reimport/', UploadedCSVReimportAPIView.as_view(), name='upload-reimport'),
    path('dashboards/', DashboardListCreateAPIView.as_view(), name='dashboards'),
    path('dashboards/<int:pk>/', DashboardDetailAPIView.as_view(), name='dashboard-detail'),
    path('dashboards/slug/<slug:slug>/', PublicDashboardRetrieveAPIView.as_view(), name='dashboard-public'),

    # Auth endpoints
    path('token-auth/', drf_views.obtain_auth_token, name='api-token-auth'),
    path('register/', RegisterUserView.as_view(), name='register'),
    # cookie-based helpers
    path('login-cookie/', LoginCookieView.as_view(), name='login-cookie'),
    path('logout-cookie/', LogoutCookieView.as_view(), name='logout-cookie'),
    path('me/', MeView.as_view(), name='me'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('token/refresh-cookie/', JwtRefreshCookieView.as_view(), name='jwt-refresh-cookie'),
    path('token/logout/', JwtLogoutView.as_view(), name='jwt-logout'),
    path('arr-summary/', ARRSummaryAPIView.as_view(), name='arr-summary'),
    # Insights alias (keeps API semantics clear for frontend)
    path('insights/', ARRSummaryAPIView.as_view(), name='insights'),
    # Automations (MVP)
    path('automations/', AutomationListCreateAPIView.as_view(), name='automations'),
    path('automations/<int:pk>/', AutomationDetailAPIView.as_view(), name='automation-detail'),
    path('automations/<int:pk>/run/', AutomationRunAPIView.as_view(), name='automation-run'),
    # OpenAPI / Swagger
    path('schema/', SpectacularAPIView.as_view(), name='schema'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
