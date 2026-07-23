import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


class SupabaseAuthError(Exception):
    pass


def _base_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise SupabaseAuthError("SUPABASE_URL/SUPABASE_ANON_KEY가 설정되지 않았습니다.")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_token(authorization_header):
    if not authorization_header or not authorization_header.lower().startswith("bearer "):
        raise SupabaseAuthError("인증 토큰이 없습니다. 로그인 후 다시 시도해주세요.")
    return authorization_header.split(" ", 1)[1].strip()


def get_authed_client(token) -> Client:
    """PostgREST 요청에 사용자 토큰을 실어 보내 RLS가 해당 사용자 기준으로 적용되게 한다."""
    client = _base_client()
    client.postgrest.auth(token)
    return client


def get_current_user(token):
    client = _base_client()
    try:
        resp = client.auth.get_user(token)
    except Exception as e:
        raise SupabaseAuthError(f"유효하지 않은 토큰입니다: {e}")
    if not resp or not resp.user:
        raise SupabaseAuthError("유효하지 않은 토큰입니다.")
    return resp.user


def authenticate(authorization_header):
    """Authorization 헤더로부터 (user, RLS-scoped client) 튜플을 반환한다."""
    token = get_token(authorization_header)
    user = get_current_user(token)
    client = get_authed_client(token)
    return user, client
