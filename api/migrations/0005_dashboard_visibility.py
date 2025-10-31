# Migration: add visibility field to Dashboard (0005)
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_add_upload_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='dashboard',
            name='visibility',
            field=models.CharField(default='private', max_length=16, choices=[('private', 'Private'), ('public', 'Public')]),
        ),
    ]
