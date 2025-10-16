from rest_framework.authentication import TokenAuthentication
from rest_framework import exceptions
from rest_framework.authtoken.models import Token
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieTokenAuthentication(TokenAuthentication):
    """Authentication that first attempts JWT access_token cookie, then falls back to TokenAuthentication header or cookie.

    This allows browsers to use HttpOnly JWT cookies while still supporting API token header for programmatic clients.
    """
    def authenticate(self, request):
        # Try JWT cookie first
        access = request.COOKIES.get('access_token')
        if access:
            jwt_auth = JWTAuthentication()
            try:
                validated = jwt_auth.get_validated_token(access)
                user = jwt_auth.get_user(validated)
                return (user, validated)
            except Exception:
                # If JWT fails, continue to other methods
                pass

        # Fallback to normal TokenAuthentication (header or auth_token cookie)
        header_result = super().authenticate(request)
        if header_result is not None:
            return header_result

        # Also support old-style auth_token cookie for backwards compatibility
        token = request.COOKIES.get('auth_token')
        if not token:
            return None

        try:
            token_obj = Token.objects.select_related('user').get(key=token)
        except Token.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid token in cookie')

        return (token_obj.user, token_obj)
