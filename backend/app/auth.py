"""Accounts, passwords and sessions.

Passwords are hashed with PBKDF2-SHA256 (Python standard library, no extra dependency) with a random salt per
account. A login returns a random bearer token; only its SHA-256 hash is stored in `sessions`, so a leaked database
doesn't hand out working logins.
"""

import datetime as dt
import hashlib
import hmac
import secrets

from fastapi import Header, HTTPException

from .db import DB, connect

ITERATIONS = 210_000  # OWASP 2023 guidance for PBKDF2-SHA256 is 600k; 210k keeps serverless logins fast
SESSION_DAYS = 30


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt, digest = stored.split("$")
    except ValueError:
        return False  # e.g. demo accounts, which have no password
    if scheme != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations)).hex()
    return hmac.compare_digest(candidate, digest)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _iso(d: dt.datetime) -> str:
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def create_session(db: DB, account_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=SESSION_DAYS)
    db.execute("insert into sessions (token_hash, account_id, expires_at) values (?, ?, ?)",
               (_token_hash(token), account_id, _iso(expires)))
    return token


def delete_session(db: DB, token: str) -> None:
    db.execute("delete from sessions where token_hash = ?", (_token_hash(token),))


def account_json(row: dict) -> dict:
    """The Account shape the frontend uses (frontend/src/auth/types.ts)."""
    listing_id = f"p{row['producer_id']}" if row.get("producer_id") else (
        f"m{row['manufacturer_id']}" if row.get("manufacturer_id") else None)
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "name": row["name"],
        "company": row["company"],
        "abn": row["abn"],
        "role": row["role"],
        "site": {"name": row["company"], "suburb": row["locality"], "state": row["state"],
                 "lat": row["lat"], "lng": row["lng"]},
        "listingId": listing_id,
        "demo": bool(row.get("is_demo")),
    }


def account_for_token(db: DB, token: str) -> dict | None:
    row = db.execute(
        "select a.* from sessions s join accounts a on a.id = s.account_id where s.token_hash = ? and s.expires_at > ?",
        (_token_hash(token), _iso(dt.datetime.now(dt.timezone.utc)))).fetchone()
    return row


def bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def optional_account(authorization: str | None = Header(default=None)) -> dict | None:
    """FastAPI dependency: the signed-in account row, or None."""
    token = bearer(authorization)
    if not token:
        return None
    with connect() as db:
        return account_for_token(db, token)


def require_account(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI dependency: the signed-in account row, or 401."""
    account = optional_account(authorization)
    if account is None:
        raise HTTPException(status_code=401, detail="Log in to do this.")
    return account
