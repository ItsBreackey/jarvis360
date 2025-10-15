from rest_framework import serializers

class ForecastUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
