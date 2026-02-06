#!/usr/bin/env python3
"""Run preset tests manually."""

import sys
from pathlib import Path

# Add the tests directory to path
sys.path.insert(0, str(Path(__file__).parent))

from test_presets import TestFilmPresets

def run_tests():
    """Run all tests and report results."""
    test_class = TestFilmPresets()
    test_methods = [m for m in dir(test_class) if m.startswith("test_")]
    
    passed = 0
    failed = 0
    failures = []
    
    print("=" * 60)
    print("Running Film Presets Tests")
    print("=" * 60)
    
    for method_name in test_methods:
        try:
            method = getattr(test_class, method_name)
            method()
            print(f"✓ {method_name}")
            passed += 1
        except AssertionError as e:
            print(f"✗ {method_name}: {e}")
            failed += 1
            failures.append((method_name, str(e)))
        except Exception as e:
            print(f"✗ {method_name}: ERROR - {e}")
            failed += 1
            failures.append((method_name, f"ERROR: {e}"))
    
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)
    
    if failures:
        print("\nFailures:")
        for name, error in failures:
            print(f"  - {name}: {error}")
    
    return failed == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
