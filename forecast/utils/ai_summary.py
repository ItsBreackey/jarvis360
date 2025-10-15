from textwrap import shorten

def generate_ai_summary(forecast_data):
    values = [f["yhat"] for f in forecast_data]
    trend = "increasing" if values[-1] > values[0] else "decreasing"
    avg_value = sum(values) / len(values)
    summary = f"The forecast shows a {trend} trend with an average predicted value of {avg_value:.2f}."
    return shorten(summary, width=250)
