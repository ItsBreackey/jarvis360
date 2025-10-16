from django.urls import path, include

urlpatterns = [
    # Include the new analysis app for Overview and Simulation
    path('analysis/', include('analysis.urls')),
    
    # Existing forecast app
    path('forecast/', include('forecast.urls')),
]
