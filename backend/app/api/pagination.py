from typing import Any

from sqlalchemy.orm import Query


def paginate(query: Query[Any], page: int, page_size: int) -> tuple[list[Any], int]:
    total = query.order_by(None).count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return rows, total
