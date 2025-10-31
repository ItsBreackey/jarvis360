from analysis.arr import compute_mrr_and_arr, top_customers_by_mrr


def test_compute_mrr_and_arr_basic():
    records = [
        {'customer_id': 'a', 'mrr': 100},
        {'customer_id': 'b', 'mrr': 200},
        {'customer_id': 'c', 'mrr': '50'},
    ]
    out = compute_mrr_and_arr(records)
    assert out['MRR'] == 350
    assert out['ARR'] == 350 * 12


def test_top_customers():
    records = [
        {'customer_id': 'a', 'mrr': 100},
        {'customer_id': 'b', 'mrr': 200},
        {'customer_id': 'a', 'mrr': 50},
    ]
    tops = top_customers_by_mrr(records, limit=2)
    assert len(tops) == 2
    assert tops[0]['customer_id'] == 'b'
    assert tops[0]['mrr'] == 200
    assert tops[1]['customer_id'] == 'a'
    assert tops[1]['mrr'] == 150
