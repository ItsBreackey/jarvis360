from django.db import models

class UploadedDataset(models.Model):
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='datasets/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ForecastResult(models.Model):
    dataset = models.ForeignKey(UploadedDataset, on_delete=models.CASCADE, related_name='results')
    forecast_data = models.JSONField()
    summary = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Forecast for {self.dataset.name}"
