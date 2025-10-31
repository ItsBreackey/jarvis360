# Forecast job lifecycle (Mermaid)

```mermaid
sequenceDiagram
  participant User
  participant UI as Client UI
  participant Server
  participant LLM as Gemini/AI
  participant Storage as Snapshots

  User->>UI: Request forecast (run scenario)
  UI->>UI: create job record (job-UUID), show pending UI
  UI->>Server: POST /api/forecast-jobs { jobId, payload }
  Server->>LLM: call Gemini with timeout/backoff
  LLM-->>Server: forecast result + narrative
  Server-->>Storage: save forecast snapshot (snapshotId, updatedAt)
  Server-->>UI: 200 { jobId, snapshotId, forecast }
  UI->>Storage: merge local snapshot copy (mergeAndPersist or similar)
  UI->>UI: render forecast chart + narrative; clear pending state

  alt LLM error / slow
    Server--xUI: delayed or retrying
    UI->>UI: show spinner, allow cancel
  end
```