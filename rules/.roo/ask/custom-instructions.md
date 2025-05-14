KuzuMem_MCP_strategy:

# ──────────────────────────────────────────────

  initialization: |-
    <thinking> **CHECK FOR KuzuMem-MCP (branch-aware)** </thinking>
    <thinking>
      • Ensure KuzuMem-MCP server is registered.  
      • Detect current Git branch → ${branch} (default main).  
      • Detect client project root → ${clientProjectRoot}.
      • Synthetic repo-ID = ${repository}:${branch}.  
      • Does a memory bank exist for this repo-ID?  
        – yes → if_memory_bank_exists  
        – no  → if_no_memory_bank  
    </thinking>
    <list_resources><server_name>KuzuMem-MCP</server_name></list_resources>

# ──────────────────────────────────────────────

  if_no_memory_bank: |-
    1. Tell user:  
       "No KuzuMem-MCP repository for **${repository}** on branch **${branch}**.  
       Switch to *Architect mode* to create one?"  
    2. If user declines →  
       • Reply "[MEMORY BANK: INACTIVE]" and continue / ask follow-up.  
    3. If user accepts →  
       • Switch to Architect mode (creation handled there).

# ──────────────────────────────────────────────

  if_memory_bank_exists: |-
    <thinking> READ MEMORY-BANK DATA </thinking>
    1. get-metadata — scope, tech stack.  
    2. get-context --latest true --limit 10 — recent activity.  
    3. Component scan; for each critical component:  
       • get-component-dependencies  
       • get-component-dependents  
    4. Architecture artefacts: governing items, decisions, rules.  
    5. Reply "[MEMORY BANK: ACTIVE]"; if user gave no task →  
       "How may I help you with your project?"

# ──────────────────────────────────────────────

  general:
    status_prefix: "[MEMORY BANK: ACTIVE] | [MEMORY BANK: INACTIVE]"
    response_format: |-
      Return either  
        • JSON tool call {"tool": {"name": "...", "arguments": {...}}}  
        • Plain Markdown if no tool call.
    guardrails:
      - "Always include --clientProjectRoot and --branch; Ask mode is read-only."
      - "Strip secrets; unsafe requests → REFUSE: <reason>."
    token_budget: 800

# ──────────────────────────────────────────────

  memory_bank_updates:
    frequency: "Ask mode does not write directly."
    instructions: |-
      When you discover important architectural **decisions, components, context,
      or rules**:

        1. Tell the user why it should be documented.  
        2. Suggest switching to *Architect mode* to record it.  
        3. Indicate which memory type would be updated  
           (metadata • context • component • decision • rule).  
        4. Remind that updates will be stored on branch **${branch}**
           within the client project root **${clientProjectRoot}**.

      Example —  
        "We just chose JWT for authentication.  
         Switch to Architect mode to document this decision for *${branch}*?"

# ──────────────────────────────────────────────

  KuzuMem_MCP_best_practices:
    id_conventions: |-
      - Component: `comp-[DescriptiveName]`   (e.g., comp-AuthService)  
      - Decision : `dec-[YYYYMMDD]-[slug]`    (e.g., dec-20250514-auth-jwt)  
      - Rule     : `rule-[category]-vX.Y.Z`   (semantic versioning)
    branch_awareness: |-
      - Branch and clientProjectRoot params required for all calls.
      - Repo-ID = name + ':' + branch.  
      - Knowledge is isolated per branch unless explicitly copied.
      - Each client project gets its own isolated database in its project root.
    graph_capabilities: |-
      - Graph model (KuzuDB) enables dependency, impact and structure queries.  
      - When you recommend Architect mode, highlight possible analyses
        (PageRank for hotspots, community detection for modules, etc.).
