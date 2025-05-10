memory_bank_strategy:
  initialization: |
      <thinking>
      - **CHECK FOR ADVANCED MEMORY BANK (KuzuDB/Branch-aware):**
      </thinking>
      <thinking>
      *First, check if the Advanced Memory Bank MCP server is registered.
      </thinking>
      <list_resources>
      <server_name>advanced-memory-bank-mcp</server_name>
      </list_resources>
      <thinking>
      *If Advanced Memory Bank server is found, check if a repository exists for this project and branch (synthetic repo ID: name:branch).
      *If a repository exists, skip immediately to `if_memory_bank_exists`.
      </thinking>
  if_no_memory_bank: |
      1. **Inform the User:**  
          "No Advanced Memory Bank repository was found for this project. I recommend creating one to maintain debugging history and error patterns. Would you like to switch to Architect mode to initialize one?"
      2. **Conditional Actions:**
         * If the user declines:
          <thinking>
          I need to proceed with the task without Memory Bank functionality.
          </thinking>
          a. Inform the user that the Memory Bank will not be created.
          b. Set the status to '[MEMORY BANK: INACTIVE]'.
          c. Proceed with the task using the current context if needed or if no task is provided, use the `ask_followup_question` tool.
         * If the user agrees:
          Switch to Architect mode to create the Memory Bank.
  if_memory_bank_exists: |
        **READ ALL MEMORY BANK DATA**
        <thinking>
        I will read all memory bank data, one type at a time.
        </thinking>
        Plan: Read all repository data sequentially.
        1. Read metadata using `get-metadata`
        2. Read contexts using appropriate query
        3. Read components using appropriate query
        4. Read decisions using appropriate query
        5. Read rules using appropriate query
        6. Set status to [MEMORY BANK: ACTIVE] and inform user.
        7. Proceed with the task using the context from the Memory Bank or if no task is provided, use the `ask_followup_question` tool.

general:
  status_prefix: "Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]', according to the current state of the Memory Bank."

memory_bank_updates:
  frequency:

- "UPDATE MEMORY BANK THROUGHOUT THE CHAT SESSION, WHEN SIGNIFICANT CHANGES OCCUR IN THE PROJECT."
  decisions:
    trigger: "When a significant debugging decision is made (bug root cause, fix approach, testing strategy, etc.). Use your judgment to determine significance."
    action: |
      <thinking>
      I need to update the Memory Bank with a new decision record using `add-decision`.
      The decision should include a descriptive name, context information about the bug, and the current date.
      </thinking>
      Use append_to_file to *append* new information. Never overwrite existing entries. Always include a timestamp.
    format: |
      "add-decision [repository] dec-[YYYYMMDD]-[bug-id-description] --name \"[Bug Fix Approach]\" --context \"[Bug Details and Fix Rationale]\" --date \"[YYYY-MM-DD]\""
  metadata:
    trigger: "When the high-level debugging approach or tools change significantly. Use your judgment to determine significance."
    action: |
      <thinking>
      A fundamental change has occurred which warrants an update to the project metadata.
      I should use `update-metadata` to modify the repository metadata with debugging-related information.
      </thinking>
      Use append_to_file to *append* new information or use apply_diff to modify existing entries if necessary. Timestamp and summary of change will be appended as footnotes to the end of the file.
    format: "update-metadata [repository] --tech-stack \"[Updated Debug Tools]\" --architecture \"[Updated Testing Architecture]\""
  components:
    trigger: "When new error patterns are discovered or components with bugs are identified. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new component using `add-component`.
      The component should include the name of the buggy module, its kind, dependencies, and current status.
      </thinking>
      Use append_to_file to *append* new patterns or use apply_diff to modify existing entries if warranted. Always include a timestamp.
    format: "add-component [repository] comp-[ComponentName] --name \"[Component With Bug]\" --kind \"[Component Type]\" --depends-on \"[Dependencies]\" --status \"[fixed/pending]\""
  contexts:
    trigger: "When debugging sessions produce important insights or when bug patterns emerge. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new context entry using `add-context`.
      The context should include the debugging agent, a summary of findings, decisions made, and observations about error patterns.
      </thinking>
      Use append_to_file to *append* to the relevant section or use apply_diff to modify existing entries if warranted. Always include a timestamp.
    format: "add-context [repository] --agent \"[Debugger]\" --summary \"[Debugging Session Summary]\" --decision \"[Fix Decision]\" --observation \"[Error Pattern Observation]\""
  rules:
    trigger: "When new testing rules or error prevention guidelines are established. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new rule using `add-rule`.
      The rule should include a name, creation date, triggers related to testing/debugging, rule content, and status.
      </thinking>
      Use append_to_file to *append* the new entry, never overwrite existing entries. Always include a timestamp.
    format: "add-rule [repository] rule-[testing]-v[X.Y.Z] --name \"[Testing Rule]\" --created \"[YYYY-MM-DD]\" --triggers \"[error1,error2]\" --content \"[Prevention Rule Content]\" --status \"active\""

umb:
  trigger: "^(Update Memory Bank|UMB)$"
  instructions:
    - "Halt Current Task: Stop current activity"
    - "Acknowledge Command: '[MEMORY BANK: UPDATING]'"
    - "Review Chat History"
  core_update_process: |
      1. Current Session Review:
          - Analyze complete debug history
          - Extract significant bug patterns
          - Track resolution approaches
          - Map error relationships
      2. Comprehensive Updates:
          - Update from debugging perspective
          - Document identified bugs
          - Record resolution strategies
          - Note testing approaches
          - Document error prevention measures
      3. Memory Bank Synchronization:
          - Update all affected memory entries
          - Ensure debugging context is preserved
          - Document bug patterns clearly
          - Note prevention strategies
  task_focus: "During a UMB update, focus on capturing any bugs identified, error patterns discovered, or debugging techniques developed *during the chat session*. This information should be added to the appropriate Memory Bank repository using the correct MCP tools. *Do not* attempt to summarize the entire project or perform actions outside the scope of the current debugging session."
  cross-mode_updates: "During a UMB update, ensure that all relevant debugging information from the chat session is captured and added to the Memory Bank. This includes any bugs found, resolution approaches, and prevention strategies. Use the appropriate MCP tools to record this information."
  post_umb_actions:
    - "Memory Bank fully synchronized"
    - "Bug patterns documented"
    - "Resolution strategies recorded"
    - "Prevention measures established"
    - "Next debugging session will have complete context"
  override_file_restrictions: true
  override_mode_restrictions: true

memory_bank_best_practices:
  debugging_patterns: |
    - Document recurring bug types with clear patterns
    - Record resolution strategies that succeeded
    - Note testing approaches that caught specific bugs
    - Tag components prone to particular error types
  error_prevention: |
    - Create rules for preventing common bugs
    - Document test cases that should be added
    - Record validation strategies that catch errors
    - Note code review focus areas for bug-prone components
  bug_tracking: |
    - Use consistent bug IDs in decision records (dec-YYYYMMDD-bug-description)
    - Link related bugs through common components
    - Track resolution status in component status field
    - Document time-to-resolution metrics
