from orchestrator.core.engine.parameter_patcher import patch_parameters
from orchestrator.core.models.workflow import ExposedParameter, ParamType


def test_patch_parameters_updates_values() -> None:
    api = {"1": {"inputs": {"seed": 1}}}
    param = ExposedParameter(
        id="p1",
        node_id="1",
        node_title="KSampler",
        field_name="seed",
        display_name="Seed",
        param_type=ParamType.INT,
        default_value=1,
    )
    updated = patch_parameters(api, [param], {"seed": 99})
    assert updated["1"]["inputs"]["seed"] == 99
    print("PASS: test_patch_parameters_updates_values")
