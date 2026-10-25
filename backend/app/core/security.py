"""Cryptographic primitives. Only maintained libraries and stdlib primitives are used."""

import hashlib
import hmac
import ipaddress
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

# argon2-cffi defaults follow RFC 9106's recommended Argon2id profile.
_hasher = PasswordHasher()
# Verified against when an account does not exist, so the response time does not
# reveal whether the email is registered.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def generate_token() -> str:
    """256 bits from the OS CSPRNG, URL-safe."""
    return secrets.token_urlsafe(32)


def _key() -> bytes:
    return get_settings().secret_key.get_secret_value().encode()


def hash_token(token: str) -> str:
    """Keyed hash used to store session and reset tokens; a DB leak alone cannot forge them."""
    return hmac.new(_key(), b"token:" + token.encode(), hashlib.sha256).hexdigest()


def derive_csrf_token(session_token: str) -> str:
    """Synchronizer CSRF token bound to the session, recomputable without storage."""
    return hmac.new(_key(), b"csrf:" + session_token.encode(), hashlib.sha256).hexdigest()


def constant_time_equals(a: str | None, b: str | None) -> bool:
    if not a or not b:
        return False
    return hmac.compare_digest(a.encode(), b.encode())


def anonymize_ip(ip: str | None) -> str | None:
    """Keep only the network prefix (/24 for IPv4, /48 for IPv6) to limit stored personal data."""
    if not ip:
        return None
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    prefix = 24 if addr.version == 4 else 48
    return str(ipaddress.ip_network(f"{addr}/{prefix}", strict=False))
