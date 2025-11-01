"""Insights service: compute ARR/MRR KPIs for an organization.

This module centralizes the calculations so views and other callers
can rely on a single implementation. It uses the normalized
`Subscription` and `Customer` models from `api.models` and the
helpers in `analysis.arr`.
"""
from typing import Dict, Any, Optional
from ..models import Subscription

from analysis.arr import compute_mrr_and_arr, top_customers_by_mrr
from datetime import date


def compute_org_kpis(org, since: Optional[date] = None) -> Dict[str, Any]:
    """Compute KPIs (MRR/ARR) and top customers for the given org.

    If `since` is provided (date), subscriptions with start_date < since are excluded.

    Returns:
        {'kpis': {'MRR': float, 'ARR': float}, 'top_customers': [...]}
    """
    records = []
    try:
        subs_qs = Subscription.objects.filter(customer__org=org)
        if since is not None:
            subs_qs = subs_qs.filter(start_date__gte=since)
        for s in subs_qs:
            try:
                mrr_val = float(s.mrr or 0)
            except Exception:
                # defensively coerce Decimal/str -> float
                try:
                    mrr_val = float(str(s.mrr))
                except Exception:
                    mrr_val = 0.0
            cid = s.customer.external_id or s.customer.name or str(getattr(s.customer, 'pk', ''))
            records.append({'customer_id': cid, 'mrr': mrr_val, 'signup_date': s.start_date})
    except Exception:
        # If the subscription model is not available or DB access fails,
        # return zeroed KPIs to allow graceful degradation in the API.
        return {'kpis': {'MRR': 0.0, 'ARR': 0.0}, 'top_customers': []}

    kpis = compute_mrr_and_arr(records) if records else {'MRR': 0.0, 'ARR': 0.0}
    tops = top_customers_by_mrr(records, limit=10) if records else []

    return {'kpis': kpis, 'top_customers': tops}
