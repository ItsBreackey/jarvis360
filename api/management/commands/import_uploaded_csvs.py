from django.core.management.base import BaseCommand
from api.models import UploadedCSV
from api.importer import import_single_upload

class Command(BaseCommand):
    help = 'Import UploadedCSV files into normalized Customer and Subscription rows.'

    def add_arguments(self, parser):
        parser.add_argument('--org', type=int, help='Organization id to import for (optional)')
        parser.add_argument('--limit', type=int, default=None, help='Max rows per upload to process')

    def handle(self, *args, **options):
        org_id = options.get('org')
        limit = options.get('limit')
        qs = UploadedCSV.objects.all()
        if org_id:
            qs = qs.filter(org_id=org_id)
        imported = 0
        for u in qs:
            try:
                created = import_single_upload(u, sample_lines=limit)
                imported += created
            except Exception as e:
                self.stderr.write(f'Failed import for upload {u.pk}: {e}')
        self.stdout.write(self.style.SUCCESS(f'Imported {imported} subscriptions'))
