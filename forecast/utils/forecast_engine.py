# forecast/utils/forecast_engine.py
import pandas as pd
from prophet import Prophet
import logging

logger = logging.getLogger(__name__)

def generate_forecast(file_path, periods=30):
    """
    Generates a forecast using Prophet from a CSV file.

    Args:
        file_path (str): Path to the CSV file containing 'ds' and 'y' columns.
        periods (int): Number of future periods to forecast.

    Returns:
        List[Dict]: List of dictionaries with keys: 'ds', 'yhat', 'yhat_lower', 'yhat_upper'.
    """
    # Load CSV
    df = pd.read_csv(file_path)

    # Normalize column names
    df.columns = [col.lower() for col in df.columns]

    # Validate required columns
    if 'ds' not in df.columns or 'y' not in df.columns:
        raise ValueError("CSV must contain 'ds' (date/time) and 'y' (value) columns")

    # Ensure ds is datetime and y is numeric
    df['ds'] = pd.to_datetime(df['ds'])
    df['y'] = pd.to_numeric(df['y'], errors='coerce').fillna(df['y'].mean()) # Handle NaNs in 'y'

    # Initialize and fit Prophet model
    model = Prophet()
    try:
        model.fit(df)
    except Exception as e:
        logger.error(f"Prophet fit failed: {e}")
        raise ValueError(f"Prophet failed to fit the model. Check data granularity/quality. Error: {e}")

    # Make future dataframe
    future = model.make_future_dataframe(periods=periods)
    forecast = model.predict(future)

    # Select relevant columns and only the last 'periods' rows
    result = forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail(periods)

    # Convert 'ds' to string to make JSON serializable
    result['ds'] = result['ds'].dt.strftime('%Y-%m-%d %H:%M:%S')

    # Convert to list of dicts, ensuring floats are rounded for cleaner JSON
    return result.round(2).to_dict(orient='records')
