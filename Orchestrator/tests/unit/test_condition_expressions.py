import pytest

from orchestrator.core.conditions.expressions import ParsedExpression, parse_expression


def test_parse_expression_comparison() -> None:
    expr = parse_expression("output.faces_count > 0")
    assert expr == ParsedExpression(left="output.faces_count", operator=">", right=0)


def test_parse_expression_float() -> None:
    expr = parse_expression("output.score >= 0.75")
    assert expr.right == 0.75


def test_parse_expression_bool() -> None:
    expr = parse_expression("output.valid == true")
    assert expr.right is True


def test_parse_expression_string() -> None:
    expr = parse_expression('output.label == "cat"')
    assert expr.right == "cat"


def test_parse_expression_invalid_format() -> None:
    with pytest.raises(ValueError):
        parse_expression("output.only")
