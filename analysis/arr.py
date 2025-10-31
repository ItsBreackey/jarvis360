"""ARR calculation utilities.

Provide simple functions to compute MRR/ARR and top customers from normalized records.
A record is a dict with keys: 'customer_id' (str), 'mrr' (float), 'signup_date' (date or None).
"""
from collections import defaultdict
from typing import Iterable, Dict, Any, List, Tuple


def compute_mrr_and_arr(records: Iterable[Dict[str, Any]]) -> Dict[str, float]:
    """Compute total MRR and ARR from records."""
    total_mrr = 0.0
    for r in records:
        try:
            total_mrr += float(r.get('mrr') or 0)
        except Exception:
            continue
    return {'MRR': total_mrr, 'ARR': total_mrr * 12}


def top_customers_by_mrr(records: Iterable[Dict[str, Any]], limit: int = 10) -> List[Dict[str, Any]]:
    """Return top customers sorted by MRR.

    Each returned item: { 'customer_id': id, 'mrr': sum }
    """
    by_id: Dict[str, float] = defaultdict(float)
    for r in records:
        cid = r.get('customer_id') or r.get('id') or r.get('name') or 'unknown'
        try:
            by_id[str(cid)] += float(r.get('mrr') or 0)
        except Exception:
            continue
    out = sorted([{'customer_id': k, 'mrr': v} for k, v in by_id.items()], key=lambda x: x['mrr'], reverse=True)
    return out[:limit]
