"""Outbound email. The "outbox" backend is for local development only (blocked in production)."""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

from app.core.config import get_settings
from app.core.database import utcnow

log = logging.getLogger("securesphere.mail")


def send(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    msg = EmailMessage()
    msg["From"] = settings.mail_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    if settings.mail_backend == "outbox":
        outbox = Path(settings.mail_outbox_dir)
        outbox.mkdir(parents=True, exist_ok=True)
        name = f"{utcnow().strftime('%Y%m%dT%H%M%S%f')}.eml"
        (outbox / name).write_text(msg.as_string(), encoding="utf-8")
        log.info("mail_written_to_dev_outbox", extra={"data": {"file": name}})
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
        smtp.send_message(msg)
    log.info("mail_sent")
