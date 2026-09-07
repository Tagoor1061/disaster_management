"""
Official IMD OAuth JWT Authentication & Token Lifecycle Service
================================================================
Manages secure authentication for India Meteorological Department (IMD) APIs:
- OAuth Token Endpoint: POST https://api.imd.gov.in/api/oauth/token.php
- Request Headers: X-API-KEY and Authorization: Bearer <JWT>
- In-memory thread-safe token caching with automatic expiry tracking and renewal.
- Redacts credentials and JWT tokens from all log outputs.
- Graceful degradation when credentials are under verification or unconfigured.
"""

import os
import time
import logging
import threading
import urllib3
import requests
from flask import current_app

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger("suraksha_kavach.imd_auth")

IMD_TOKEN_URL = "https://api.imd.gov.in/api/oauth/token.php"
USER_AGENT = "SurakshaKavach-DisasterMonitoring/2.0 (Guntur Municipal Corporation; disaster-mgmt.gov.in)"
REQUEST_TIMEOUT = 12
TOKEN_EXPIRY_BUFFER_SECONDS = 300  # Refresh 5 minutes before actual expiry


class IMDAuthManager:
    """Thread-safe manager for IMD OAuth JWT token acquisition and caching."""

    _lock = threading.RLock()
    _access_token = None
    _token_expires_at = 0
    _last_auth_attempt = 0
    _last_status = "UNINITIALIZED"
    _last_error_message = None

    @classmethod
    def _get_config_value(cls, key, default=""):
        """Safely fetch config from Flask current_app or environment variable."""
        val = None
        try:
            if current_app:
                val = current_app.config.get(key)
        except Exception:
            pass
        if not val:
            val = os.getenv(key, default)
        return str(val).strip() if val else default

    @classmethod
    def get_credentials(cls):
        """Retrieve configured credentials (server-side only)."""
        email = cls._get_config_value("IMD_EMAIL")
        password = cls._get_config_value("IMD_PASSWORD")
        api_key = cls._get_config_value("IMD_API_KEY")
        return email, password, api_key

    @classmethod
    def is_configured(cls):
        """Check if IMD credentials are configured."""
        email, password, api_key = cls.get_credentials()
        return bool(email and password and api_key)

    @classmethod
    def get_token(cls, force_refresh=False):
        """
        Obtain a valid IMD JWT Bearer token.
        Returns (token_str, status_dict).
        """
        email, password, api_key = cls.get_credentials()

        if not email or not password or not api_key:
            with cls._lock:
                cls._last_status = "AWAITING_VERIFICATION"
                cls._last_error_message = (
                    "IMD credentials pending configuration / account verification. "
                    "Set IMD_EMAIL, IMD_PASSWORD, and IMD_API_KEY in environment."
                )
            return None, cls.get_auth_status()

        now = time.time()

        with cls._lock:
            # Return cached token if still valid
            if not force_refresh and cls._access_token and (now < cls._token_expires_at - TOKEN_EXPIRY_BUFFER_SECONDS):
                return cls._access_token, cls.get_auth_status()

            # Prevent high-frequency hammering if auth fails repeatedly
            if not force_refresh and (now - cls._last_auth_attempt < 30) and cls._last_status in ("AUTH_FAILED", "NETWORK_ERROR"):
                return cls._access_token, cls.get_auth_status()

            cls._last_auth_attempt = now

            try:
                headers = {
                    "User-Agent": USER_AGENT,
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/plain, */*",
                }
                payload = {
                    "email": email,
                    "password": password
                }

                logger.info("Requesting new IMD OAuth JWT token from %s...", IMD_TOKEN_URL)
                resp = requests.post(
                    IMD_TOKEN_URL,
                    json=payload,
                    headers=headers,
                    verify=False,
                    timeout=REQUEST_TIMEOUT
                )

                if resp.status_code == 200:
                    try:
                        data = resp.json()
                    except Exception:
                        data = {}

                    token = data.get("access_token") or data.get("token")
                    expires_in = int(data.get("expires_in", 3600))

                    if token:
                        cls._access_token = str(token).strip()
                        cls._token_expires_at = now + expires_in
                        cls._last_status = "AUTHENTICATED"
                        cls._last_error_message = None
                        logger.info("IMD OAuth JWT token acquired successfully (valid for %d seconds).", expires_in)
                        return cls._access_token, cls.get_auth_status()
                    else:
                        cls._last_status = "AUTH_FAILED"
                        cls._last_error_message = "IMD OAuth response missing access_token."
                        logger.warning("IMD OAuth response received but missing access_token.")
                elif resp.status_code in (401, 403):
                    cls._last_status = "AWAITING_VERIFICATION"
                    cls._last_error_message = f"IMD account authentication pending verification (HTTP {resp.status_code})."
                    logger.warning("IMD authentication rejected (HTTP %d). Account may be awaiting verification.", resp.status_code)
                elif resp.status_code == 429:
                    cls._last_status = "RATE_LIMITED"
                    cls._last_error_message = "IMD OAuth endpoint rate limit encountered. Backing off."
                    logger.warning("IMD OAuth rate limit reached.")
                else:
                    cls._last_status = "SERVER_ERROR"
                    cls._last_error_message = f"IMD OAuth endpoint returned HTTP {resp.status_code}."
                    logger.warning("IMD OAuth returned HTTP %d", resp.status_code)

            except requests.Timeout:
                cls._last_status = "NETWORK_TIMEOUT"
                cls._last_error_message = "IMD OAuth token request timed out."
                logger.warning("IMD OAuth token request timed out.")
            except requests.RequestException as exc:
                cls._last_status = "NETWORK_ERROR"
                cls._last_error_message = f"Connection to IMD OAuth endpoint failed: {exc.__class__.__name__}"
                logger.warning("IMD OAuth connection error: %s", exc.__class__.__name__)
            except Exception as exc:
                cls._last_status = "ERROR"
                cls._last_error_message = f"Unexpected auth error: {exc.__class__.__name__}"
                logger.error("Unexpected IMD auth exception occurred.")

            return cls._access_token, cls.get_auth_status()

    @classmethod
    def get_authenticated_headers(cls, force_refresh=False):
        """
        Build full request headers for authenticated IMD API calls:
        X-API-KEY: <IMD_API_KEY>
        Authorization: Bearer <JWT>
        """
        _, _, api_key = cls.get_credentials()
        token, auth_status = cls.get_token(force_refresh=force_refresh)

        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
        }

        if api_key:
            headers["X-API-KEY"] = api_key
            headers["x-api-key"] = api_key

        if token:
            headers["Authorization"] = f"Bearer {token}"

        return headers, auth_status

    @classmethod
    def invalidate_token(cls):
        """Force invalidate cached token (e.g. after receiving a 401 on an API call)."""
        with cls._lock:
            cls._access_token = None
            cls._token_expires_at = 0
            cls._last_status = "EXPIRED"

    @classmethod
    def get_auth_status(cls):
        """Return safe, non-sensitive authentication status."""
        email, password, api_key = cls.get_credentials()
        is_configured = bool(email and password and api_key)
        now = time.time()
        has_valid_token = bool(cls._access_token and now < cls._token_expires_at)
        seconds_left = max(0, int(cls._token_expires_at - now)) if has_valid_token else 0

        return {
            "is_configured": is_configured,
            "has_credentials": {
                "email_set": bool(email),
                "password_set": bool(password),
                "api_key_set": bool(api_key),
            },
            "status": cls._last_status if is_configured else "AWAITING_VERIFICATION",
            "has_valid_token": has_valid_token,
            "token_expires_in_seconds": seconds_left,
            "message": cls._last_error_message or (
                "IMD Authentication active & token cached" if has_valid_token
                else ("IMD Credentials configured; ready for authentication" if is_configured
                      else "IMD Live Data Connection — Awaiting Account Verification / Configuration")
            )
        }
