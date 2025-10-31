"""Cohort utilities for Jarvis360.

This module provides simple cohortization and retention matrix utilities used by the
ARR summary API. It's intentionally small and well-tested so frontend work can iterate.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, Iterable, List, Tuple


def month_bucket(d: date) -> Tuple[int, int]:
    """Return (year, month) tuple for a date."""
    return (d.year, d.month)


def cohortize(signup_dates: Iterable[date]) -> Dict[Tuple[int, int], int]:
    """Given an iterable of signup dates, return counts per signup-month bucket.

    Returns a dict mapping (year, month) -> count.
    """
    counts: Dict[Tuple[int, int], int] = defaultdict(int)
    for d in signup_dates:
        if d is None:
            continue
        key = month_bucket(d)
        counts[key] += 1
    return dict(counts)


def retention_matrix(signup_dates_and_active_months: Iterable[Tuple[date, int]]) -> Dict[Tuple[int, int], List[int]]:
    """Build a retention matrix.

    Input: iterable of (signup_date, active_months)
    active_months is the number of months the customer remained active (1 means active in signup month only)

    Returns: mapping (signup_year, signup_month) -> list where index 0 is month-0 retention (should equal cohort size), index 1 is month-1 retention count, etc.
    """
    # First, group by cohort
    cohorts: Dict[Tuple[int, int], List[int]] = defaultdict(list)
    for signup_date, active_months in signup_dates_and_active_months:
        if signup_date is None:
            continue
        cohort = month_bucket(signup_date)
        # We'll represent as the active months count for each member; later we convert to retention counts
        cohorts[cohort].append(int(active_months))

    # Convert to retention counts per cohort
    matrix: Dict[Tuple[int, int], List[int]] = {}
    for cohort, members_active in cohorts.items():
        max_months = max(members_active) if members_active else 0
        # retention[i] = number of members with active_months > i
        retention = [0] * max_months
        for m in members_active:
            for i in range(m):
                retention[i] += 1
        matrix[cohort] = retention

    return matrix
