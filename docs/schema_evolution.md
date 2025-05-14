# Schema Evolution

```mermaid
flowchart TD
  classDef pk fill:#f96,stroke:#333,stroke-width:2px
  classDef added fill:#c8e6c9,stroke:#333,stroke-width:2px

  Repository["Repository [PK] id (name:branch) name branch …"]
  Metadata["Metadata [PK] graph_unique_id id, branch, …"]
  Context["Context [PK] graph_unique_id id, branch, …"]
  Component["Component [PK] graph_unique_id id, branch, kind, status, …"]
  Decision["Decision [PK] graph_unique_id id, branch, …"]
  Rule["Rule [PK] graph_unique_id id, branch, status, …"]

  %% ──────── New, minimal additions ────────
  File["File [PK] graph_unique_id path language metrics (JSON) …"]
  Tag["Tag [PK] name color"]

  %% ──────── Original relationships ────────
  Repository -- HAS_METADATA --> Metadata
  Repository -- HAS_CONTEXT  --> Context
  Repository -- HAS_COMPONENT --> Component
  Repository -- HAS_DECISION --> Decision
  Repository -- HAS_RULE --> Rule
  Component  -- DEPENDS_ON --> Component
  Context    -- CONTEXT_OF --> Component
  Context    -- CONTEXT_OF_DECISION --> Decision
  Context    -- CONTEXT_OF_RULE --> Rule
  Decision   -- DECISION_ON --> Component

  %% ──────── New relationships ────────
  Repository -- HAS_FILE --> File
  Component  -- IMPLEMENTED_BY --> File
  File       -- BELONGS_TO --> Component

  Component  -- TAGGED --> Tag
  Rule       -- TAGGED --> Tag
  Context    -- TAGGED --> Tag
  File       -- TAGGED --> Tag

  %% ──────── Styling ────────
  class Repository pk
  class Metadata,Context,Component,Decision,Rule,File pk
  class File,Tag added
