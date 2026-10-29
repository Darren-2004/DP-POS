import base64
import hashlib
import hmac
import json
import os
import time


PIN_SALT = os.getenv("PIN_SALT", "pos-locale-clothing-boutique-salt-key-2026")
SESSION_TTL_SECONDS = 12 * 60 * 60


def hash_pin(pin):
    if not pin:
        raise ValueError("PIN is required")
    return hashlib.sha256(f"{pin}{PIN_SALT}".encode("utf-8")).hexdigest()


def verify_pin(pin, hashed_pin):
    if not pin or not hashed_pin:
        return False
    return hmac.compare_digest(hash_pin(str(pin)), str(hashed_pin))


def create_session_token(user_id, secret, now=None):
    expires_at = int(now if now is not None else time.time()) + SESSION_TTL_SECONDS
    payload = json.dumps(
        {"userId": str(user_id), "expiresAt": expires_at},
        separators=(",", ":"),
    ).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(secret, encoded_payload, hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=")
    return f"{encoded_payload.decode('ascii')}.{encoded_signature.decode('ascii')}"


def verify_session_token(token, secret, now=None):
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        expected_signature = hmac.new(
            secret, encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        signature = base64.urlsafe_b64decode(
            encoded_signature + "=" * (-len(encoded_signature) % 4)
        )
        if not hmac.compare_digest(expected_signature, signature):
            return None
        payload = base64.urlsafe_b64decode(
            encoded_payload + "=" * (-len(encoded_payload) % 4)
        )
        claims = json.loads(payload)
        current_time = int(now if now is not None else time.time())
        if int(claims["expiresAt"]) <= current_time:
            return None
        return str(claims["userId"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None