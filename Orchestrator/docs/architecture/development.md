# Development Setup (Windows PowerShell)

This project uses `uv` for dependency management and running commands. Use `uv` for all Python and test runs.

## Install Dependencies

```powershell
uv pip install -e .[dev]
```

## Run Commands (Always via uv)

```powershell
uv run python -m orchestrator.main
uv run pytest tests\unit\test_config.py -v
```

## Common Troubleshooting

- If `uv` is missing, install it from https://astral.sh/uv/.
- If PowerShell blocks scripts, enable execution for the session:
  - `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
