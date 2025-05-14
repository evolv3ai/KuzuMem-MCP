KuzuMem_MCP_strategy:

# ──────────────────────────────────────────────

  initialization: |
    <thinking> CHECK ADVANCED DEBUGGING MEMORY-BANK </thinking>
    <thinking>
      • Verify KuzuMem-MCP server is registered.  
      • Detect current Git branch → ${branch} (default main).  
      • Synthetic repo-ID = ${repository}:${branch}.  
      • Does a memory bank exist for this repo-ID?  
        - yes → if_memory_bank_exists  
        - no  → if_no_memory_bank  
    </thinking>
    <list_resources><server_name>KuzuMem-MCP</server_name></list_resources>

# ──────────────────────────────────────────────

  if_no_memory_bank: |
    1. Ask user —  
       “No KuzuMem-MCP repository for **${repository}** on branch **${branch}**.  
       Switch to *Architect mode* to create one for debugging history?”  
    2. If user declines →  
       • Reply “[MEMORY BANK: INACTIVE]” and proceed / ask_followup_question.  
    3. If user accepts →  
       • Switch to Architect mode (creation handled there).

# ──────────────────────────────────────────────

  if_memory_bank_exists: |
    <thinking> LOAD DEBUGGING CONTEXT </thinking>
    1. get-metadata — capture debug tools info.  
    2. get-context --latest true --limit 10 — recent debug sessions.  
    3. List components with known bugs; for each:  
       • get-component-dependencies  
       • get-governing-items-for-component  
    4. Reply “[MEMORY BANK: ACTIVE]”; if no task → ask_followup_question.

general:
  status_prefix: "[MEMORY BANK: ACTIVE] | [MEMORY BANK: INACTIVE]"
  response_format: >
    Return either  
      • JSON tool call {"tool": {"name": "...", "arguments": {...}}}  
      • Plain Markdown if no tool call.
  guardrails:
    - Always pass --branch; Ask mode is read-only.
    - Strip secrets; unsafe → REFUSE: <reason>.
  token_budget: 800
  override_file_restrictions: true
  override_mode_restrictions: true

memory_bank_updates:
  frequency: "Update continuously when significant debugging events occur."
  decisions:
    trigger: "Bug root cause, fix approach, testing strategy."
    format: |
      add-decision {repository} dec-{YYYYMMDD}-{bugSlug} --branch {branch} \
      --name "{Fix Approach}" --context "{Bug Details}" --date {YYYY-MM-DD}
  metadata:
    trigger: "Debug tooling or strategy changes."
    format: |
      update-metadata {repository} --branch {branch} \
      --metadata {"debugTools":"...","testingApproach":"..."}
  components:
    trigger: "New error patterns or buggy components identified."
    format: |
      add-component {repository} comp-{Name} --branch {branch} --name "{Name}" \
      --kind "{Type}" --depends_on [...] --status fixed|pending
  contexts:
    trigger: "Debug session insights or error patterns found."
    format: |
      update-context {repository} --branch {branch} --agent "{Debugger}" \
      --summary "{Summary}" --decision "{Fix Decision}" \
      --observation "{Error Observation}"
  rules:
    trigger: "New testing rules or prevention guidelines."
    format: |
      add-rule {repository} rule-testing-vX.Y.Z --branch {branch} \
      --name "{Rule}" --created {YYYY-MM-DD} --triggers [...] \
      --content "{Content}" --status active

bug_analysis:
  error_dependencies:
    format: |
      get-component-dependencies {repository} --branch {branch} \
      --componentId comp-{BuggyComponent}
    purpose: "Upstream contributors to a bug."
  error_impact:
    format: |
      get-component-dependents {repository} --branch {branch} \
      --componentId comp-{BuggyComponent}
    purpose: "Downstream components affected."
  error_constraints:
    format: |
      get-governing-items-for-component {repository} --branch {branch} \
      --componentId comp-{BuggyComponent}
    purpose: "Rules/decisions governing a buggy component."
  bug_history:
    format: |
      get-item-contextual-history {repository} --branch {branch} \
      --itemType Component --itemId comp-{BuggyComponent}
    purpose: "Complete debug history of a component."
  related_bugs:
    format: |
      get-related-items {repository} --branch {branch} \
      --startItemId comp-{BuggyComponent} --depth 1
    purpose: "Neighbouring error records."

graph_algorithms:
  error_patterns:
    format: |
      mcp_pagerank {repository} --branch {branch} --projectedGraphName errorInfluence \
      --nodeTableNames ["Component"] --relationshipTableNames ["DEPENDS_ON"]
    purpose: "Critical error-prone components."
  error_clusters:
    format: |
      louvain_community_detection {repository} --branch {branch} \
      --projectedGraphName errorClusters --nodeTableNames ["Component"] \
      --relationshipTableNames ["DEPENDS_ON"]
    purpose: "Groups of related errors."
  error_cycles:
    format: |
      strongly_connected_components {repository} --branch {branch} \
      --projectedGraphName errorCycles --nodeTableNames ["Component"] \
      --relationshipTableNames ["DEPENDS_ON"]
    purpose: "Circular dependencies causing cascades."
  error_propagation:
    format: |
      shortest_path {repository} --branch {branch} --projectedGraphName errorPath \
      --nodeTableNames ["Component"] --relationshipTableNames ["DEPENDS_ON"] \
      --startNodeId {SourceId} --endNodeId {TargetId}
    purpose: "Propagation path between two errors."

umb:
  trigger: "^(Update Memory Bank|UMB)$"
  ack: "[MEMORY BANK: UPDATING]"
  core_update_process: |
    1. Analyse branch-specific debug chat.  
    2. Update metadata, components, decisions, context, rules with --branch.  
    3. Confirm writes; summarise debug updates for this branch.

best_practices:
  id_conventions:
    - "Component: comp-{Name}"
    - "Decision: dec-{YYYYMMDD}-{bugSlug}"
    - "Rule: rule-testing-v{semver}"
  branch_awareness: |
    • Memory isolated per branch; always pass --branch.  
    • Repo-ID = ${repository}:${branch}.
  debugging_patterns: |
    • Document recurring bug patterns.  
    • Record fix strategies and prevention rules.  
    • Tag error-prone components.
  error_prevention: |
    • Create tests/rules to block common bugs.  
    • Store review checklists for fragile code.
  bug_tracking: |
    • Use consistent bug IDs in decisions.  
    • Track status via component.status fixed/pending.
  graph_usage: |
    • PageRank → error hotspots.  
    • Community detection → error clusters.  
    • SCC → cascading cycles.  
    • shortest-path → propagation.  
    • k-core / WCC for subsystems.
