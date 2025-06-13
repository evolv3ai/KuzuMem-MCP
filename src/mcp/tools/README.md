## Streaming Support for Graph Operations

The KuzuMem-MCP server supports progressive results for several long-running graph operations via the `tools/progress` notification channel. This allows clients to receive updates as the operation executes, rather than waiting for the complete result.

The following tools support progressive results:

| Tool Name                           | Progress Information Example                                            |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `get-component-dependencies`        | Reports initialization, then dependencies found at each level.          |
| `get-component-dependents`          | Reports initialization, then dependents as they are found/processed.    |
| `get-item-contextual-history`       | Reports initialization, then batches of context history items.          |
| `get-governing-items-for-component` | Reports initialization, then fetched decisions, then fetched rules.     |
| `get-related-items`                 | Reports initialization, then items found at each traversal depth.       |
| `k-core-decomposition`              | Reports initialization, then progress per k-value or pruning stage.     |
| `louvain-community-detection`       | Reports initialization, then progress per iteration/level.              |
| `pagerank`                          | Reports initialization, then progress per iteration.                    |
| `strongly-connected-components`     | Reports initialization, then identified components or phases.           |
| `weakly-connected-components`       | Reports initialization, then identified components or phases.           |
| `shortest-path`                     | Reports initialization, then steps in path exploration (if applicable). |

### Client Integration for Progressive Results

Clients can receive progress notifications by implementing handlers for JSON-RPC notifications with the method `tools/progress`.

Progress notifications have the following format:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/progress",
  "params": {
    "id": "request-id", // Matches the ID of the original tools/call request
    "content": [{ "type": "text", "text": "{ ... progress data ... }" }],
    "isFinal": false // or true for the last progress update
  }
}
```

- The `content[0].text` field will contain a JSON string. The structure of this JSON string is specific to the tool and the stage of progress. For successful completion, it's typically the wrapper object that the Operation Class for that tool returns (e.g., `{ "status": "initializing", "message": "..." }` or `{ "status": "in_progress", "data_chunk": [...] }`).
- The `isFinal` flag indicates whether this is the last progress notification for a request.
  - When `isFinal: false`, more progress notifications may follow.
  - When `isFinal: true`, this is the concluding progress update. It typically contains the full result wrapper (or an error wrapper).

Following a `tools/progress` notification where `isFinal: true`, the client will also receive a standard JSON-RPC response message (e.g., `event: mcpResponse` in SSE, or a direct JSON line in stdio) for the original `tools/call` request. This final response will contain the complete result (or error) for the tool call, ensuring compatibility with clients that may not process intermediate `tools/progress` notifications.
