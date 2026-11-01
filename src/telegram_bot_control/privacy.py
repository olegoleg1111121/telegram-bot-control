"""Telemetry never needs a message body or a Telegram token."""

import re
import traceback
from collections.abc import Iterable

TOKEN = re.compile(r"\b\d{5,}:[A-Za-z0-9_-]{20,}\b")
ASSIGNMENT = re.compile(
    r"(?i)((?:token|password|secret|api_key|authorization)\s*[=:]\s*)"
    r"(?:[\"'][^\"'\r\n]*[\"']|[^\s,;\r\n]+)"
)


def redact(text: str, secrets: Iterable[str] = ()) -> str:
    for secret in secrets:
        if secret:
            text = text.replace(secret, "[REDACTED]")
    text = TOKEN.sub("[REDACTED]", text)
    return ASSIGNMENT.sub(r"\1[REDACTED]", text)


def describe_error(error: BaseException, secrets: Iterable[str] = ()) -> dict[str, str]:
    # Frame summaries only: source lines can contain message literals and credentials.
    frames = traceback.extract_tb(error.__traceback__)
    trace = "\n".join(
        f'  File "{frame.filename}", line {frame.lineno}, in {frame.name}' for frame in frames
    )
    kind = type(error).__name__
    try:
        message = redact(str(error), secrets)[:2000]
    except Exception:
        message = "Exception message unavailable"
    return {
        "type": kind,
        "message": message,
        "traceback": redact(f"{trace}\n{kind}: {message}", secrets)[-16000:],
    }
