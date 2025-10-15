import requests
with open('test_overview.csv','rb') as f:
    files = {'file': ('test_overview.csv', f, 'text/csv')}
    r = requests.post('http://127.0.0.1:8000/api/overview/', files=files, timeout=30)
    with open('scripts/overview_response.html','wb') as out:
        out.write(r.content)
    print('STATUS', r.status_code)
    print('Wrote scripts/overview_response.html')
