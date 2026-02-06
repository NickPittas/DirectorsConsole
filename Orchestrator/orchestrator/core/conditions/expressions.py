from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ParsedExpression:
    left: str
    operator: str
    right: Any


def parse_expression(expression: str) -> ParsedExpression:
    tokens = expression.strip().split()
    if len(tokens) != 3:
        raise ValueError("Expression must be in form '<left> <op> <right>'")

    left, operator, raw_right = tokens
    right = _parse_literal(raw_right)

    return ParsedExpression(left=left, operator=operator, right=right)


def _parse_literal(raw_right: str) -> Any:
    try:
        return int(raw_right)
    except ValueError:
        try:
            return float(raw_right)
        except ValueError:
            lowered = raw_right.lower()
            if lowered in {"true", "false"}:
                return lowered == "true"
            return raw_right.strip('"')
