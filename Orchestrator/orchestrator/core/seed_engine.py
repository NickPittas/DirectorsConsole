"""Seed variation engine for generating unique seeds in parallel generation.

This module provides strategies for generating visually diverse seeds
while maintaining reproducibility when needed.
"""

from __future__ import annotations

import random
from typing import Sequence

from loguru import logger

from orchestrator.core.models.job_group import SeedStrategy


class SeedVariationEngine:
    """Generates unique seeds for parallel generation.

    Different strategies ensure visual diversity while maintaining
    reproducibility when needed.

    Attributes:
        MIN_SEED: Minimum valid seed value (0).
        MAX_SEED: Maximum valid seed value (2^63 - 1 for ComfyUI).
        MIN_RANDOM_DISTANCE: Minimum distance between random seeds for diversity.
    """

    # Seed range limits (ComfyUI uses 64-bit seeds)
    MIN_SEED = 0
    MAX_SEED = 2**63 - 1

    # Minimum distance between random seeds to ensure visual diversity
    MIN_RANDOM_DISTANCE = 1_000_000

    def generate_seeds(
        self,
        count: int,
        strategy: SeedStrategy = SeedStrategy.RANDOM,
        base_seed: int | None = None,
    ) -> list[int]:
        """Generate unique seeds for parallel generation.

        Args:
            count: Number of seeds to generate.
            strategy: Strategy for seed generation.
            base_seed: Starting seed (random if None).

        Returns:
            List of unique seeds.

        Raises:
            ValueError: If count is negative.
        """
        if count < 0:
            raise ValueError(f"Count must be non-negative, got {count}")

        if count == 0:
            return []

        if base_seed is None:
            # Generate a random base seed with room for variations
            max_base = self.MAX_SEED - count * self.MIN_RANDOM_DISTANCE
            base_seed = random.randint(self.MIN_SEED, max(max_base, self.MIN_SEED))
            logger.debug(f"Generated random base seed: {base_seed}")

        base_seed = self._clamp_seed(base_seed)

        if strategy == SeedStrategy.SEQUENTIAL:
            return self._sequential_seeds(base_seed, count)
        elif strategy == SeedStrategy.FIBONACCI:
            return self._fibonacci_seeds(base_seed, count)
        elif strategy == SeedStrategy.GOLDEN_RATIO:
            return self._golden_ratio_seeds(base_seed, count)
        else:  # RANDOM
            return self._random_seeds(base_seed, count)

    def _random_seeds(self, base_seed: int, count: int) -> list[int]:
        """Generate random seeds with minimum distance guarantee.

        Uses a seeded random generator for reproducibility.

        Args:
            base_seed: Starting seed for the random generator.
            count: Number of seeds to generate.

        Returns:
            List of random seeds with minimum distance from each other.
        """
        seeds = [base_seed]
        rng = random.Random(base_seed)  # Seeded for reproducibility

        for _ in range(count - 1):
            attempts = 0
            while attempts < 100:
                candidate = rng.randint(self.MIN_SEED, self.MAX_SEED)
                # Ensure minimum distance from all existing seeds
                if all(
                    abs(candidate - s) >= self.MIN_RANDOM_DISTANCE for s in seeds
                ):
                    seeds.append(candidate)
                    break
                attempts += 1
            else:
                # Fallback: just pick a random seed after max attempts
                fallback_seed = rng.randint(self.MIN_SEED, self.MAX_SEED)
                seeds.append(fallback_seed)
                logger.warning(
                    f"Could not find seed with min distance after 100 attempts, "
                    f"using fallback: {fallback_seed}"
                )

        return seeds

    def _sequential_seeds(self, base_seed: int, count: int) -> list[int]:
        """Generate sequential seeds: base, base+1, base+2, ...

        Args:
            base_seed: Starting seed.
            count: Number of seeds to generate.

        Returns:
            List of sequential seeds.
        """
        return [self._clamp_seed(base_seed + i) for i in range(count)]

    def _fibonacci_seeds(self, base_seed: int, count: int) -> list[int]:
        """Generate seeds using Fibonacci-like spacing.

        Spacing: 1, 1, 2, 3, 5, 8, 13, 21, ... (multiplied by 1000)

        Args:
            base_seed: Starting seed.
            count: Number of seeds to generate.

        Returns:
            List of seeds with Fibonacci spacing.
        """
        seeds = [base_seed]
        fib = [1, 1]
        offset = 0

        for i in range(count - 1):
            if i < len(fib):
                offset += fib[i] * 1000
            else:
                next_fib = fib[-1] + fib[-2]
                fib.append(next_fib)
                offset += next_fib * 1000

            seeds.append(self._clamp_seed(base_seed + offset))

        return seeds

    def _golden_ratio_seeds(self, base_seed: int, count: int) -> list[int]:
        """Generate seeds using golden ratio spacing.

        Each seed is derived using the golden ratio (phi ≈ 1.618...)
        for multiplicative spacing.

        Args:
            base_seed: Starting seed.
            count: Number of seeds to generate.

        Returns:
            List of seeds with golden ratio spacing.
        """
        PHI = 1.6180339887498949
        seeds = [base_seed]

        for i in range(1, count):
            # Use multiplicative spacing with golden ratio
            multiplier = PHI**i
            offset = int(base_seed * (multiplier - 1))
            seeds.append(self._clamp_seed(base_seed + offset))

        return seeds

    def _clamp_seed(self, seed: int) -> int:
        """Clamp seed to valid range with wraparound.

        Args:
            seed: Seed value to clamp.

        Returns:
            Seed value within valid range [MIN_SEED, MAX_SEED].
        """
        return seed % (self.MAX_SEED + 1)

    def validate_seeds(self, seeds: Sequence[int]) -> bool:
        """Validate that all seeds are within valid range.

        Args:
            seeds: List of seeds to validate.

        Returns:
            True if all seeds are valid, False otherwise.
        """
        return all(
            self.MIN_SEED <= seed <= self.MAX_SEED for seed in seeds
        )
