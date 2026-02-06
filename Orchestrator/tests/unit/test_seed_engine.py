"""Tests for SeedVariationEngine.

This module provides comprehensive unit tests for the SeedVariationEngine class,
which generates unique seeds for parallel generation across multiple backends.
"""

import pytest

from orchestrator.core.models.job_group import SeedStrategy
from orchestrator.core.seed_engine import SeedVariationEngine


class TestSeedVariationEngine:
    """Tests for SeedVariationEngine class."""

    @pytest.fixture
    def engine(self) -> SeedVariationEngine:
        """Create a fresh SeedVariationEngine instance for each test."""
        return SeedVariationEngine()

    def test_random_seed_generation(self, engine: SeedVariationEngine) -> None:
        """Verify random seeds have minimum distance between them.

        Random seeds should be sufficiently spaced apart to ensure visual diversity
        between parallel generation runs.
        """
        seeds = engine.generate_seeds(count=5, strategy=SeedStrategy.RANDOM)

        # Verify we got the expected number of seeds
        assert len(seeds) == 5, f"Expected 5 seeds, got {len(seeds)}"

        # Verify minimum distance between all pairs
        for i, seed_a in enumerate(seeds):
            for j, seed_b in enumerate(seeds):
                if i != j:
                    distance = abs(seed_a - seed_b)
                    assert (
                        distance >= engine.MIN_RANDOM_DISTANCE
                    ), f"Seeds {seed_a} and {seed_b} are too close (distance: {distance})"

    def test_sequential_seeds(self, engine: SeedVariationEngine) -> None:
        """Verify sequential strategy produces base, base+1, base+2...

        Sequential strategy should generate seeds that are consecutive integers
        starting from the base seed.
        """
        base_seed = 42
        seeds = engine.generate_seeds(
            count=5, strategy=SeedStrategy.SEQUENTIAL, base_seed=base_seed
        )

        expected = [42, 43, 44, 45, 46]
        assert seeds == expected, f"Sequential seeds mismatch: {seeds} != {expected}"

    def test_fibonacci_seeds(self, engine: SeedVariationEngine) -> None:
        """Verify fibonacci strategy produces correct spacing.

        Fibonacci spacing uses the sequence: 1, 1, 2, 3, 5, 8, ...
        multiplied by 1000 for practical seed values.
        """
        base_seed = 1000
        seeds = engine.generate_seeds(
            count=6, strategy=SeedStrategy.FIBONACCI, base_seed=base_seed
        )

        # First seed is base
        assert seeds[0] == base_seed, f"First seed should be base: {seeds[0]} != {base_seed}"

        # Verify Fibonacci spacing (each offset is a Fibonacci number * 1000)
        # Expected offsets: 0, 1000, 2000, 4000, 7000, 12000
        expected_offsets = [0, 1000, 2000, 4000, 7000, 12000]
        for i, (seed, offset) in enumerate(zip(seeds, expected_offsets)):
            expected = base_seed + offset
            assert seed == expected, f"Seed {i}: {seed} != expected {expected}"

    def test_golden_ratio_seeds(self, engine: SeedVariationEngine) -> None:
        """Verify golden ratio strategy produces multiplicative spacing.

        Golden ratio spacing uses phi (≈1.618) for multiplicative spacing,
        creating aesthetically pleasing distribution.
        """
        base_seed = 100
        seeds = engine.generate_seeds(
            count=4, strategy=SeedStrategy.GOLDEN_RATIO, base_seed=base_seed
        )

        PHI = 1.6180339887498949

        # First seed is base
        assert seeds[0] == base_seed

        # Verify multiplicative spacing
        for i in range(1, len(seeds)):
            multiplier = PHI**i
            expected_offset = int(base_seed * (multiplier - 1))
            expected = engine._clamp_seed(base_seed + expected_offset)
            assert seeds[i] == expected, f"Seed {i}: {seeds[i]} != expected {expected}"

    def test_seed_count_matches_request(self, engine: SeedVariationEngine) -> None:
        """Verify correct number of seeds generated for all strategies.

        Each strategy should return exactly the requested number of seeds.
        """
        strategies = [
            SeedStrategy.RANDOM,
            SeedStrategy.SEQUENTIAL,
            SeedStrategy.FIBONACCI,
            SeedStrategy.GOLDEN_RATIO,
        ]

        for strategy in strategies:
            for count in [1, 3, 10]:
                seeds = engine.generate_seeds(count=count, strategy=strategy)
                assert len(seeds) == count, (
                    f"Strategy {strategy.value} returned {len(seeds)} seeds "
                    f"instead of {count}"
                )

    def test_seed_range_valid(self, engine: SeedVariationEngine) -> None:
        """Verify all seeds are within ComfyUI's valid range (0 to 2^63-1).

        ComfyUI uses 64-bit seeds, so all generated seeds must be within
        the valid 64-bit unsigned integer range.
        """
        strategies = [
            SeedStrategy.RANDOM,
            SeedStrategy.SEQUENTIAL,
            SeedStrategy.FIBONACCI,
            SeedStrategy.GOLDEN_RATIO,
        ]

        for strategy in strategies:
            seeds = engine.generate_seeds(count=10, strategy=strategy)
            for seed in seeds:
                assert seed >= engine.MIN_SEED, (
                    f"Seed {seed} below minimum {engine.MIN_SEED}"
                )
                assert seed <= engine.MAX_SEED, (
                    f"Seed {seed} above maximum {engine.MAX_SEED}"
                )

    def test_reproducibility_with_same_base_seed(self, engine: SeedVariationEngine) -> None:
        """Verify deterministic behavior for sequential/fibonacci/golden_ratio.

        Strategies with explicit base_seed should produce identical results
        when called multiple times with the same parameters.
        """
        deterministic_strategies = [
            SeedStrategy.SEQUENTIAL,
            SeedStrategy.FIBONACCI,
            SeedStrategy.GOLDEN_RATIO,
        ]

        base_seed = 12345
        count = 5

        for strategy in deterministic_strategies:
            seeds1 = engine.generate_seeds(
                count=count, strategy=strategy, base_seed=base_seed
            )
            seeds2 = engine.generate_seeds(
                count=count, strategy=strategy, base_seed=base_seed
            )
            assert seeds1 == seeds2, (
                f"Strategy {strategy.value} not reproducible: "
                f"{seeds1} != {seeds2}"
            )

    def test_random_with_explicit_base_seed(self, engine: SeedVariationEngine) -> None:
        """Verify random strategy uses explicit base_seed appropriately.

        When given a base_seed, random strategy should use it as the first seed
        and generate subsequent seeds using a seeded RNG for reproducibility.
        """
        base_seed = 99999
        seeds = engine.generate_seeds(
            count=3, strategy=SeedStrategy.RANDOM, base_seed=base_seed
        )

        # First seed should be the base
        assert seeds[0] == base_seed, f"First seed should be base: {seeds[0]} != {base_seed}"

        # Calling again with same base should give same result (reproducible)
        seeds2 = engine.generate_seeds(
            count=3, strategy=SeedStrategy.RANDOM, base_seed=base_seed
        )
        assert seeds == seeds2, f"Random with base_seed should be reproducible"

    def test_generate_seeds_with_zero_count(self, engine: SeedVariationEngine) -> None:
        """Verify empty list returned for zero count."""
        seeds = engine.generate_seeds(count=0, strategy=SeedStrategy.RANDOM)
        assert seeds == [], f"Expected empty list for count=0, got {seeds}"

    def test_generate_seeds_with_negative_count(self, engine: SeedVariationEngine) -> None:
        """Verify ValueError raised for negative count."""
        with pytest.raises(ValueError, match="Count must be non-negative"):
            engine.generate_seeds(count=-1, strategy=SeedStrategy.RANDOM)

    def test_generate_seeds_single_seed(self, engine: SeedVariationEngine) -> None:
        """Verify single seed generation works for all strategies."""
        strategies = [
            SeedStrategy.RANDOM,
            SeedStrategy.SEQUENTIAL,
            SeedStrategy.FIBONACCI,
            SeedStrategy.GOLDEN_RATIO,
        ]

        base_seed = 5000
        for strategy in strategies:
            seeds = engine.generate_seeds(
                count=1, strategy=strategy, base_seed=base_seed
            )
            assert len(seeds) == 1, f"Strategy {strategy.value} should return 1 seed"
            assert seeds[0] == base_seed, (
                f"Strategy {strategy.value} should return base as only seed"
            )

    def test_clamp_seed_with_overflow(self, engine: SeedVariationEngine) -> None:
        """Verify seed clamping handles overflow with wraparound."""
        # Test with seed above max
        overflow_seed = engine.MAX_SEED + 1000
        clamped = engine._clamp_seed(overflow_seed)
        assert clamped <= engine.MAX_SEED, f"Clamped seed {clamped} exceeds MAX_SEED"
        assert clamped >= engine.MIN_SEED, f"Clamped seed {clamped} below MIN_SEED"

        # Test with negative seed
        negative_seed = -500
        clamped = engine._clamp_seed(negative_seed)
        assert clamped >= engine.MIN_SEED, f"Clamped seed {clamped} below MIN_SEED"
        assert clamped <= engine.MAX_SEED, f"Clamped seed {clamped} exceeds MAX_SEED"

    def test_validate_seeds(self, engine: SeedVariationEngine) -> None:
        """Verify seed validation correctly identifies valid/invalid seeds."""
        # Valid seeds
        valid_seeds = [0, 1, 1000, engine.MAX_SEED // 2, engine.MAX_SEED]
        assert engine.validate_seeds(valid_seeds) is True, "Valid seeds marked as invalid"

        # Invalid seeds
        invalid_seeds = [-1, engine.MAX_SEED + 1]
        assert engine.validate_seeds(invalid_seeds) is False, "Invalid seeds marked as valid"

        # Mixed valid and invalid
        mixed_seeds = [0, 100, engine.MAX_SEED + 1]
        assert engine.validate_seeds(mixed_seeds) is False, "Mixed seeds marked as valid"
