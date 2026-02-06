from __future__ import annotations

from typing import Any

from .expressions import parse_expression


class ConditionEvaluator:
    def evaluate(self, expression: str, context: dict[str, Any]) -> bool:
        parsed = parse_expression(expression)
        left_value = self._resolve_field(parsed.left, context)
        return self._compare(left_value, parsed.operator, parsed.right)

    def _resolve_field(self, field_path: str, context: dict[str, Any]) -> Any:
        current: Any = context
        for part in field_path.split("."):
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                raise KeyError(f"Missing field '{field_path}'")
        return current

    def _compare(self, left: Any, operator: str, right: Any) -> bool:
        if operator == ">":
            return left > right
        if operator == "<":
            return left < right
        if operator == ">=":
            return left >= right
        if operator == "<=":
            return left <= right
        if operator == "==":
            return left == right
        if operator == "!=":
            return left != right
        raise ValueError(f"Unsupported operator: {operator}")
