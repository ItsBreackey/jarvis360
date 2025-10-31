from analysis.normalize import normalize_csv_text
import textwrap


def test_normalize_basic():
    csv = textwrap.dedent('''
    id,MRR,signup_date
    cust_a,100,2024-01-05
    cust_b,$200.00,2024-02-01
    ''')
    out = normalize_csv_text(csv)
    assert len(out) == 2
    assert out[0]['customer_id'] == 'cust_a'
    assert out[0]['mrr'] == 100
    assert out[1]['mrr'] == 200.0


def test_normalize_missing_columns():
    csv = 'foo,bar\n1,2\n'
    out = normalize_csv_text(csv)
    # no mrr column -> mrr defaults to 0
    assert len(out) == 1
    assert out[0]['mrr'] == 0.0
