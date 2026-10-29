import os
from pathlib import Path

import uvicorn


def server_tls_options():
    cert_value = os.getenv("POS_TLS_CERTFILE", "").strip()
    key_value = os.getenv("POS_TLS_KEYFILE", "").strip()
    if bool(cert_value) != bool(key_value):
        raise ValueError("Set both POS_TLS_CERTFILE and POS_TLS_KEYFILE to enable HTTPS")
    if not cert_value:
        return {}

    root = Path(__file__).resolve().parent
    cert_path = Path(cert_value).expanduser()
    key_path = Path(key_value).expanduser()
    if not cert_path.is_absolute():
        cert_path = root / cert_path
    if not key_path.is_absolute():
        key_path = root / key_path
    if not cert_path.is_file() or not key_path.is_file():
        raise ValueError("TLS certificate or private key file does not exist")
    return {"ssl_certfile": str(cert_path.resolve()), "ssl_keyfile": str(key_path.resolve())}


if __name__ == "__main__":
    try:
        tls_options = server_tls_options()
    except ValueError as error:
        raise SystemExit(str(error)) from error
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "5000")),
        reload=False,
        **tls_options,
    )