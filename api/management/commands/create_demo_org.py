from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from api.models import Organization

class Command(BaseCommand):
    help = 'Create a demo organization and user for development'

    def handle(self, *args, **options):
        User = get_user_model()
        org, _ = Organization.objects.get_or_create(slug='demo', defaults={'name': 'Demo Organization'})
        if not User.objects.filter(username='demo').exists():
            user = User.objects.create_user(username='demo', password='demo')
            profile = getattr(user, 'profile', None)
            if profile:
                profile.org = org
                profile.save()
            self.stdout.write(self.style.SUCCESS('Created demo user/demo org.'))
        else:
            self.stdout.write('Demo user already exists.')
