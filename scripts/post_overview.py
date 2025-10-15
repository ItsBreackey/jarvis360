import requests
f = {'file': open('test_overview.csv', 'rb')}
try:
    r = requests.post('http://127.0.0.1:8000/api/overview/', files=f, timeout=30)
    print(r.status_code)
    print(r.text)
except Exception as e:
    print('ERROR', e)
