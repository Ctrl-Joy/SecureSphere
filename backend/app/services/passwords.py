"""Password policy in line with NIST SP 800-63B: length over composition, plus a blocklist."""

PASSWORD_MIN = 12
PASSWORD_MAX = 128

# A small excerpt of the most common breached passwords. In production, pair this with a
# k-anonymity breached-password check (e.g. the Pwned Passwords range API).
COMMON_PASSWORDS = frozenset(
    {
        "123456789012",
        "password1234",
        "qwertyuiop12",
        "passwordpassword",
        "iloveyou1234",
        "administrator",
        "welcome12345",
        "letmein12345",
        "password123!",
        "changeme1234",
        "qwerty123456",
        "1q2w3e4r5t6y",
        "abc123456789",
        "trustno1trustno1",
        "securesphere",
        "securesphere1",
    }
)


def password_problems(password: str, *, email: str = "", name: str = "") -> list[str]:
    problems: list[str] = []
    if len(password) < PASSWORD_MIN:
        problems.append(f"Use at least {PASSWORD_MIN} characters.")
    if len(password) > PASSWORD_MAX:
        problems.append(f"Use at most {PASSWORD_MAX} characters.")
    lowered = password.lower()
    if lowered in COMMON_PASSWORDS:
        problems.append("This password is too common.")
    if len(set(password)) < 5:
        problems.append("Use more varied characters.")
    local_part = email.split("@", 1)[0].lower()
    if len(local_part) >= 4 and local_part in lowered:
        problems.append("Do not include your email address.")
    for part in name.lower().split():
        if len(part) >= 4 and part in lowered:
            problems.append("Do not include your name.")
            break
    return problems
