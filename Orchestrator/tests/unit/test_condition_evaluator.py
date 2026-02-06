import pytest

from orchestrator.core.conditions.evaluator import ConditionEvaluator


def test_evaluator_handles_simple_expression() -> None:
    evaluator = ConditionEvaluator()
    result = evaluator.evaluate("output.faces_count > 0", {"output": {"faces_count": 2}})
    assert result is True


def test_evaluator_handles_string_equality() -> None:
    evaluator = ConditionEvaluator()
    result = evaluator.evaluate('output.label == "cat"', {"output": {"label": "cat"}})
    assert result is True


def test_evaluator_raises_on_missing_field() -> None:
    evaluator = ConditionEvaluator()
    with pytest.raises(KeyError):
        evaluator.evaluate("output.missing == 1", {"output": {"value": 1}})


def test_evaluator_raises_on_unsupported_operator() -> None:
    evaluator = ConditionEvaluator()
    with pytest.raises(ValueError):
        evaluator.evaluate("output.value ~~ 1", {"output": {"value": 1}})
