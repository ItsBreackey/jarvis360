from django.test import TestCase, Client
from django.urls import reverse
import io

from .views import analyze_dataframe


class AnalyzeDataframeTests(TestCase):
	def test_analyze_dataframe_basic(self):
		import pandas as pd
		df = pd.DataFrame({
			'id': [1, 2],
			'value': [10, 20],
			'label': ['a', 'b']
		})
		stats, sample_chart, summary = analyze_dataframe(df)
		self.assertIn('id', stats)
		self.assertIn('value', stats)
		self.assertIsInstance(sample_chart, list)


class OverviewAPITests(TestCase):
	def setUp(self):
		self.client = Client()

	def test_overview_post_csv(self):
		csv = 'id,name,MRR,date\n1,Alice,100,2025-01-01\n2,Bob,150,2025-02-01\n'
		resp = self.client.post(reverse('overview_api'), {'file': io.BytesIO(csv.encode('utf-8'))})
		# Should return 200 and JSON structure
		self.assertEqual(resp.status_code, 200)
		data = resp.json()
		self.assertIn('summary', data)
		self.assertIn('stats', data)
		self.assertIn('sample_chart', data)
