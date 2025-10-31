# Scenario persistence sequence (Mermaid)

```mermaid
sequenceDiagram
  participant User
  participant UI as Client UI
  participant Local as LocalStorage
  participant Server
  participant Other as OtherTabs

  User->>UI: Click Save
  UI->>UI: create optimistic scenario (id: opt-UUID)
  UI->>Local: mergeAndPersistScenarios([optimistic], 'optimistic-save')
  Local-->>Other: storage event / dispatch 'jarvis:scenarios-changed'
  UI->>Server: POST /api/scenarios (optimistic payload)
  note over Server, UI: Server processes and assigns canonical id
  Server-->>UI: 200 { id: 1234, serverId: 'srv-1234', updatedAt }
  UI->>Local: mergeAndPersistScenarios([serverItem], 'server-confirm')
  Local-->>Other: storage event / dispatch 'jarvis:scenarios-changed'
  Other->>Local: readSavedScenarios() and reconcile
  Other-->>UI: show updated canonical scenario in list

  alt Server failure
    Server--xUI: network/error
    UI->>UI: show transient error; schedule retry/backoff or allow manual retry
  end
```
