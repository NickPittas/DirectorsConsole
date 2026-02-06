from orchestrator.core.models.workflow import (
    ExposedParameter,
    ParamConstraints,
    ParamType,
)


def test_exposed_parameter_constraints() -> None:
    param = ExposedParameter(
        id="p1",
        node_id="1",
        node_title="KSampler",
        field_name="steps",
        display_name="Steps",
        param_type=ParamType.INT,
        default_value=20,
        constraints=ParamConstraints(min_value=1, max_value=100),
    )
    assert param.constraints
    assert param.constraints.min_value == 1
    print("PASS: test_exposed_parameter_constraints")
