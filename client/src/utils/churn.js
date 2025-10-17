// Simple churn estimator based on observable features when churnProbability isn't provided.
// We intentionally avoid using any provided churnProbability in this estimator.

export function estimateChurnFromFeaturesDetailed(customer, weights = {}) {
  // features
  const MRR = Number(customer.MRR) || 0;
  const supportTickets = Number(customer.supportTickets) || 0;
  const lastActivityDays = Number(customer.lastActivityDays) || 0;

  // default weights (sum to 1)
  const w = {
    tickets: weights.tickets ?? 0.5,
    activity: weights.activity ?? 0.35,
    mrr: weights.mrr ?? 0.15,
  };

  // normalize features to [0,1]
  const ticketRisk = Math.min(supportTickets / 10, 1); // 10+ tickets => max
  const activityRisk = Math.min(lastActivityDays / 60, 1); // 60+ days inactivity => max
  const mrrRisk = 1 - Math.min(MRR / 5000, 1); // smaller MRR => higher risk; 5k+ treated as low risk

  const ticketContrib = ticketRisk * w.tickets;
  const activityContrib = activityRisk * w.activity;
  const mrrContrib = mrrRisk * w.mrr;

  let estimate = ticketContrib + activityContrib + mrrContrib;
  estimate = Math.max(0, Math.min(1, estimate));

  // Determine main driver
  const contributions = [
    { key: 'tickets', label: 'Support Tickets', value: ticketContrib },
    { key: 'activity', label: 'Last Activity', value: activityContrib },
    { key: 'mrr', label: 'MRR (low→high risk)', value: mrrContrib },
  ];
  contributions.sort((a, b) => b.value - a.value);

  return {
    estimate,
    contributions,
    mainDriver: contributions[0] || null,
    raw: { ticketRisk, activityRisk, mrrRisk, weights: w }
  };
}

// Backwards-compatible simple numeric estimator
export function estimateChurnFromFeatures(customer, weights = {}) {
  return estimateChurnFromFeaturesDetailed(customer, weights).estimate;
}

export function estimateChurnSimple(customer, weights = {}) {
  return estimateChurnFromFeatures(customer, weights);
}

export default estimateChurnFromFeaturesDetailed;
