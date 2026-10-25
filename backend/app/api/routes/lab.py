"""Security laboratory.

Every demonstration here is safe by construction:
* vulnerable patterns are only *rendered as text*, never executed;
* the SQL demo runs against a throwaway in-memory SQLite database holding fictional
  products, completely separate from application data;
* endpoints require authentication and are rate limited.
"""

import hashlib
import html
import re
import sqlite3
import time
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationError
from sqlalchemy.orm import Session

from app.api.dependencies import Principal, enforce_rate_limit, get_ctx, require_user
from app.core.database import get_db
from app.core.security import hash_password
from app.services import rate_limit
from app.services.context import RequestContext

router = APIRouter(prefix="/lab", tags=["security-lab"])

_DEMO_PRODUCTS = [
    (1, "Hardware security key", "auth", 1),
    (2, "Encrypted USB drive", "storage", 1),
    (3, "Privacy screen filter", "physical", 1),
    (4, "Internal pricing sheet (hidden)", "confidential", 0),
    (5, "Admin backup codes (hidden)", "confidential", 0),
]

_INJECTION_HINTS = re.compile(r"('|--|;|/\*|\bunion\b|\bor\b\s+\S+\s*=|\bdrop\b)", re.IGNORECASE)


def _lab_limit(
    principal: Principal = Depends(require_user),
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_ctx),
) -> Principal:
    enforce_rate_limit(db, ctx, rate_limit.LAB_USER, str(principal.user.id))
    return principal


class TextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input: str = Field(max_length=200)


class SqlDemoResult(BaseModel):
    vulnerable_query: str
    vulnerable_explanation: str
    safe_query: str
    safe_parameters: list[str]
    safe_results: list[dict[str, str | int]]
    injection_patterns_detected: bool


@router.post("/sql-injection", response_model=SqlDemoResult)
def sql_injection_demo(body: TextInput, _: Principal = Depends(_lab_limit)) -> SqlDemoResult:
    term = body.input
    # Shown for teaching only. This string is NEVER executed (hence the noqa).
    vulnerable = "SELECT id, name FROM products WHERE visible = 1 AND name LIKE '%" + term + "%'"  # noqa: S608  # nosec B608
    detected = bool(_INJECTION_HINTS.search(term))
    explanation = (
        "The input changes the structure of the query (quotes/comments/boolean logic). "
        "Concatenated into SQL, it could expose the hidden rows or worse."
        if detected
        else "No injection syntax detected, but concatenation is still unsafe: "
        "any future input could rewrite the query."
    )

    safe_sql = (
        "SELECT id, name, category FROM products WHERE visible = 1 AND name LIKE ? ESCAPE '\\'"
    )
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    param = f"%{escaped}%"
    conn = sqlite3.connect(":memory:")
    try:
        conn.execute("CREATE TABLE products (id INT, name TEXT, category TEXT, visible INT)")
        conn.executemany("INSERT INTO products VALUES (?, ?, ?, ?)", _DEMO_PRODUCTS)
        rows = conn.execute(safe_sql, (param,)).fetchall()
    finally:
        conn.close()
    return SqlDemoResult(
        vulnerable_query=vulnerable,
        vulnerable_explanation=explanation,
        safe_query=safe_sql,
        safe_parameters=[param],
        safe_results=[{"id": r[0], "name": r[1], "category": r[2]} for r in rows],
        injection_patterns_detected=detected,
    )


class XssDemoResult(BaseModel):
    raw: str
    html_encoded: str
    contains_markup: bool
    explanation: str


@router.post("/xss", response_model=XssDemoResult)
def xss_demo(body: TextInput, _: Principal = Depends(_lab_limit)) -> XssDemoResult:
    encoded = html.escape(body.input, quote=True)
    has_markup = encoded != body.input
    return XssDemoResult(
        raw=body.input,
        html_encoded=encoded,
        contains_markup=has_markup,
        explanation=(
            "Characters such as < > \" ' & are encoded, so the browser displays them as text "
            "instead of parsing them as HTML or script."
            if has_markup
            else "No HTML metacharacters present; output encoding would leave it unchanged."
        ),
    )


class HashDemoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sample: str = Field(min_length=1, max_length=64)


class HashDemoResult(BaseModel):
    weak_sha256: str
    weak_sha256_again: str
    argon2id: str
    argon2id_again: str
    argon2_ms: float
    sha256_us: float


@router.post("/password-hashing", response_model=HashDemoResult)
def hashing_demo(body: HashDemoInput, _: Principal = Depends(_lab_limit)) -> HashDemoResult:
    t0 = time.perf_counter()
    weak = hashlib.sha256(body.sample.encode()).hexdigest()
    sha_us = (time.perf_counter() - t0) * 1_000_000
    t1 = time.perf_counter()
    strong = hash_password(body.sample)
    argon_ms = (time.perf_counter() - t1) * 1000
    return HashDemoResult(
        weak_sha256=weak,
        weak_sha256_again=hashlib.sha256(body.sample.encode()).hexdigest(),
        argon2id=strong,
        argon2id_again=hash_password(body.sample),
        argon2_ms=round(argon_ms, 1),
        sha256_us=round(sha_us, 2),
    )


class SignupForm(BaseModel):
    """Deliberately strict schema used to demonstrate server-side validation."""

    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=20, pattern=r"^[a-z0-9_]+$")
    email: EmailStr
    age: int = Field(ge=13, le=120, strict=True)
    plan: Literal["free", "pro"]


class ValidationDemoResult(BaseModel):
    accepted: bool
    normalized: dict[str, str | int] | None
    errors: list[dict[str, str]]


@router.post("/validation", response_model=ValidationDemoResult)
def validation_demo(
    payload: dict[str, object], _: Principal = Depends(_lab_limit)
) -> ValidationDemoResult:
    if len(payload) > 10:
        return ValidationDemoResult(
            accepted=False,
            normalized=None,
            errors=[{"field": "body", "message": "Too many fields"}],
        )
    try:
        form = SignupForm.model_validate(payload)
    except ValidationError as exc:
        errors = [
            {
                "field": ".".join(str(p) for p in e["loc"]) or "body",
                "message": str(e["msg"]).removeprefix("Value error, "),
            }
            for e in exc.errors()
        ]
        return ValidationDemoResult(accepted=False, normalized=None, errors=errors)
    return ValidationDemoResult(accepted=True, normalized=form.model_dump(mode="json"), errors=[])
