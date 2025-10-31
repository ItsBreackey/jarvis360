import datetime

from analysis.cohorts import cohortize, retention_matrix


def test_cohortize_basic():
    dates = [
        datetime.date(2024, 1, 5),
        datetime.date(2024, 1, 20),
        datetime.date(2024, 2, 1),
        None,
    ]
    counts = cohortize(dates)
    assert counts[(2024, 1)] == 2
    assert counts[(2024, 2)] == 1


def test_retention_matrix_basic():
    # members: two signed up Jan: one active 3 months, one active 1 month
    # one signed up Feb active 2 months
    data = [
        (datetime.date(2024, 1, 5), 3),
        (datetime.date(2024, 1, 20), 1),
        (datetime.date(2024, 2, 1), 2),
    ]

    matrix = retention_matrix(data)

    # Jan cohort retention: month-0 = 2 (both), month-1 = 1 (only the 3-month member), month-2 = 1
    jan = matrix[(2024, 1)]
    assert jan[0] == 2
    assert jan[1] == 1
    assert jan[2] == 1

    feb = matrix[(2024, 2)]
    assert feb[0] == 1
    assert feb[1] == 1


def test_retention_empty():
    matrix = retention_matrix([])
    assert matrix == {}
