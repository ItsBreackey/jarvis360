"""CSV normalization helpers to produce billing records usable by ARR calculations.

The functions here are intentionally forgiving: they attempt to find common header
names (id, mrr/amount/revenue, date) and coerce values to numeric/date types.
"""
from __future__ import annotations

import io
from typing import List, Dict, Any
import pandas as pd
import re
from datetime import date


AMOUNT_CLEAN_RE = re.compile(r"[^0-9.\-]")


def _clean_amount(val: Any) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if s == '':
        return 0.0
    # Remove common currency characters and commas
    s = AMOUNT_CLEAN_RE.sub('', s)
    try:
        return float(s)
    except Exception:
        return 0.0


def normalize_csv_text(csv_text: str, sample_lines: int | None = None) -> List[Dict[str, Any]]:
    """Parse CSV text into normalized billing records.

    Returns list of records with keys: 'customer_id', 'mrr', 'signup_date' (date or None), 'raw'
    """
    if not csv_text or not csv_text.strip():
        return []
    # Use pandas to read CSV robustly
    try:
        df = pd.read_csv(io.StringIO(csv_text))
    except Exception:
        # fallback: try a more permissive read with python engine
        try:
            df = pd.read_csv(io.StringIO(csv_text), engine='python')
        except Exception:
            return []

    # Heuristics for columns
    cols = {c.lower(): c for c in df.columns}
    def find(colnames):
        for name in colnames:
            ln = name.lower()
            for c in cols:
                if ln == c or ln in c or c in ln:
                    return cols[c]
        return None

    id_col = find(['id', 'customer_id', 'customer', 'name'])
    mrr_col = find(['mrr', 'revenue', 'amount', 'price', 'monthly_revenue', 'value'])
    date_col = find(['date', 'signup_date', 'start_date', 'created_at', 'uploadedat'])

    out = []
    # Optionally limit rows if sample_lines provided
    it = df.iterrows()
    for idx, row in it:
        if sample_lines is not None and idx >= sample_lines:
            break
        customer_id = None
        if id_col:
            customer_id = row.get(id_col)
        if pd.isna(customer_id):
            customer_id = None
        mrr = 0.0
        if mrr_col:
            mrr = _clean_amount(row.get(mrr_col))
        # If mrr looks like annual values (very large), we keep as-is — leave caller to decide
        signup = None
        if date_col:
            try:
                dt = pd.to_datetime(row.get(date_col), errors='coerce')
                if not pd.isna(dt):
                    signup = dt.date()
            except Exception:
                signup = None
        out.append({'customer_id': str(customer_id) if customer_id is not None else None, 'mrr': float(mrr), 'signup_date': signup, 'raw': row.to_dict()})

    return out
