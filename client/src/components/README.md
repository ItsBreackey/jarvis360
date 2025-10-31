UploadStatusPoller

Usage:

1. Import the component where you need to show upload progress:

```tsx
import UploadStatusPoller from './components/UploadStatusPoller'

function UploadPage({ uploadId }) {
  return (
    <div>
      <h3>Upload status</h3>
      <UploadStatusPoller uploadId={uploadId} />
    </div>
  )
}
```

2. Ensure your app is served from the same origin as the API or configure CORS and cookies accordingly.

Notes:
- The component expects the upload detail endpoint to be available at `/api/uploads/{id}/`.
- It uses `fetch` with `credentials: 'include'` so cookie-based auth will work.
