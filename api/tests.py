from django.test import TestCase

# Create your tests here.
from django.test import TestCase, Client
from rest_framework.test import APIClient
import json
from django.core.files.uploadedfile import SimpleUploadedFile
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


class APIPersistenceTests(TestCase):
	"""Tests for registration, token auth, uploads, and dashboard CRUD."""

	def setUp(self):
		from django.contrib.auth import get_user_model
		User = get_user_model()
		self.username = 'apitest'
		self.password = 's3cret!'
		# Create a user via register endpoint to simulate real flow
		self.client = Client()
		resp = self.client.post('/api/register/', {'username': self.username, 'password': self.password, 'org_name': 'APITestOrg'})
		self.assertEqual(resp.status_code, 201)
		data = resp.json()
		self.token = data.get('token')
		self.auth_headers = {'HTTP_AUTHORIZATION': f'Token {self.token}'}
		self.api_client = APIClient()

	def test_token_auth_obtain(self):
		# Obtain token using DRF endpoint
		resp = self.client.post('/api/token-auth/', {'username': self.username, 'password': self.password})
		self.assertEqual(resp.status_code, 200)
		self.assertIn('token', resp.json())

	def test_upload_csv_authenticated(self):
		csv = 'id,value\n1,10\n2,20\n'
		# Use SimpleUploadedFile to simulate multipart file upload
		uploaded = SimpleUploadedFile('test.csv', csv.encode('utf-8'), content_type='text/csv')
		resp = self.client.post('/api/uploads/', {'file': uploaded}, **self.auth_headers)
		self.assertIn(resp.status_code, (200, 201))
		# List uploads should show at least one
		resp2 = self.client.get('/api/uploads/', **self.auth_headers)
		self.assertEqual(resp2.status_code, 200)
		items = resp2.json()
		self.assertIsInstance(items, list)

	def test_login_upload_save_flow(self):
		# Register a user and org
		username = 'flowuser'
		password = 'flowpass'
		org_name = 'FlowOrg'
		resp = self.client.post('/api/register/', {'username': username, 'password': password, 'org_name': org_name}, content_type='application/json')
		self.assertEqual(resp.status_code, 201)
		token = resp.json().get('token')
		self.assertTrue(token)

		# Login via token endpoint to verify token works
		resp2 = self.client.post('/api/token-auth/', {'username': username, 'password': password}, content_type='application/json')
		self.assertEqual(resp2.status_code, 200)

		# Upload a small CSV via the uploads endpoint
		csv_content = 'id,MRR,date\n1,100,2021-01-01\n'
		from django.core.files.uploadedfile import SimpleUploadedFile
		f = SimpleUploadedFile('test.csv', csv_content.encode('utf-8'), content_type='text/csv')
		self.api_client.credentials(HTTP_AUTHORIZATION='Token ' + token)
		upload_resp = self.api_client.post('/api/uploads/', {'file': f}, format='multipart')
		self.assertIn(upload_resp.status_code, (200,201))

		# Save a dashboard
		dash_payload = {'name': 'Flow Dashboard', 'config': {'k': 'v'}}
		save_resp = self.api_client.post('/api/dashboards/', dash_payload, content_type='application/json')
		self.assertIn(save_resp.status_code, (200,201))
		data = save_resp.json()
		self.assertEqual(data.get('name'), 'Flow Dashboard')
	def test_dashboard_crud(self):
		# Create a dashboard
		cfg = {'widgets': [{'type': 'chart', 'col': 'value'}]}
		payload = {'name': 'TestDash', 'config': cfg}
		resp = self.client.post('/api/dashboards/', data=json.dumps(payload), content_type='application/json', **self.auth_headers)
		self.assertEqual(resp.status_code, 201)
		created = resp.json()
		self.assertEqual(created.get('name'), 'TestDash')
		dash_id = created.get('id')

		# List dashboards
		resp2 = self.client.get('/api/dashboards/', **self.auth_headers)
		self.assertEqual(resp2.status_code, 200)
		list_items = resp2.json()
		self.assertTrue(any(d.get('id') == dash_id for d in list_items))

		# Update dashboard
		new_cfg = {'widgets': [{'type': 'table', 'cols': ['id', 'value']} ]}
		resp3 = self.client.put(f'/api/dashboards/{dash_id}/', data=json.dumps({'name': 'Updated', 'config': new_cfg}), content_type='application/json', **self.auth_headers)
		self.assertIn(resp3.status_code, (200, 202))
		updated = resp3.json()
		self.assertEqual(updated.get('name'), 'Updated')

		# Delete dashboard
		resp4 = self.client.delete(f'/api/dashboards/{dash_id}/', **self.auth_headers)
		self.assertIn(resp4.status_code, (204, 200))

	def test_tenant_isolation(self):
		# Create user A (org A)
		c = Client()
		r1 = c.post('/api/register/', {'username': 'userA', 'password': 'pwA', 'org_name': 'OrgA'})
		self.assertEqual(r1.status_code, 201)
		tokenA = r1.json().get('token')
		hA = {'HTTP_AUTHORIZATION': f'Token {tokenA}'}

		# Create user B (org B)
		r2 = c.post('/api/register/', {'username': 'userB', 'password': 'pwB', 'org_name': 'OrgB'})
		self.assertEqual(r2.status_code, 201)
		tokenB = r2.json().get('token')
		hB = {'HTTP_AUTHORIZATION': f'Token {tokenB}'}

		# User A uploads a CSV and creates a dashboard
		from django.core.files.uploadedfile import SimpleUploadedFile
		up = SimpleUploadedFile('a.csv', b'id,val\n1,10\n', content_type='text/csv')
		ru = c.post('/api/uploads/', {'file': up}, **hA)
		self.assertIn(ru.status_code, (200, 201))
		rd = c.post('/api/dashboards/', data=json.dumps({'name': 'ADash', 'config': {'a': 1}}), content_type='application/json', **hA)
		self.assertEqual(rd.status_code, 201)
		dashA = rd.json()

		# User B should not see User A's dashboard or uploads
		listB_uploads = c.get('/api/uploads/', **hB)
		self.assertEqual(listB_uploads.status_code, 200)
		self.assertFalse(any('a.csv' in (i.get('filename') or '') for i in listB_uploads.json()))

		listB_dash = c.get('/api/dashboards/', **hB)
		self.assertEqual(listB_dash.status_code, 200)
		self.assertFalse(any(d.get('id') == dashA.get('id') for d in listB_dash.json()))

