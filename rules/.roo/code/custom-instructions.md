memory_bank_strategy:
  initialization: |
      <thinking>
      - **CHECK FOR ADVANCED MEMORY BANK:**
      </thinking>
          <thinking>
        *First, check if the Advanced Memory Bank MCP server is registered.
          </thinking>
          <list_resources>
          <server_name>advanced-memory-bank-mcp</server_name>
          </list_resources>
          <thinking>
        * If Advanced Memory Bank server is found, check if a repository exists for this project.
        *If a repository exists, skip immediately to `if_memory_bank_exists`.
          </thinking>
  if_no_memory_bank: |
      1. **Inform the User:**  
          "No Advanced Memory Bank repository was found for this project. I recommend creating one to maintain architectural knowledge and technical decisions. Would you like to switch to Architect mode to initialize one?"
      2. **Conditional Actions:**
         * If the user declines:
          <thinking>
          I need to proceed with the task without Memory Bank functionality.
          </thinking>
          a. Inform the user that the Memory Bank will not be created.
          b. Set the status to '[MEMORY BANK: INACTIVE]'.
          c. Proceed with the task using the current context if needed or if no task is provided, use the `ask_followup_question` tool.
         * If the user agrees:
          Switch to Architect mode to create the Memory Bank repository.
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
    trigger: "When a significant architectural decision is made (new component, data flow change, technology choice, implementation approach, etc.). Use your judgment to determine significance."
    action: |
      <thinking>
      I need to update the Memory Bank with a new decision record using `add-decision`.
      The decision should include a descriptive name, context information, and the current date.
      </thinking>
      Use the MCP tool to record the decision. Make sure to include the repository name, a well-formatted ID, and all required information.
    format: |
      "add-decision [repository] dec-[YYYYMMDD]-[brief-description] --name \"[Decision Name]\" --context \"[Context Information]\" --date \"[YYYY-MM-DD]\""
  metadata:
    trigger: "When the high-level project description, goals, features, or overall architecture changes significantly. Use your judgment to determine significance."
    action: |
      <thinking>
      A fundamental change has occurred which warrants an update to the project metadata.
      I should use `update-metadata` to modify the repository metadata.
      </thinking>
      Use the MCP tool to update metadata. Ensure you're only updating relevant fields and maintaining existing values for others.
    format: "update-metadata [repository] --tech-stack \"[Updated Tech Stack]\" --architecture \"[Updated Architecture]\""
  components:
    trigger: "When new architectural components are introduced or existing ones are modified. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new component using `add-component`.
      The component should include a name, kind, dependencies, and status.
      </thinking>
      Use the MCP tool to add the component. Make sure to properly document all dependencies and relationships.
    format: "add-component [repository] comp-[ComponentName] --name \"[Component Name]\" --kind \"[Component Kind]\" --depends-on \"[Dependencies]\" --status \"[Status]\""
  contexts:
    trigger: "When the current focus of work changes, or when significant progress is made. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new context entry using `add-context`.
      The context should include the agent name, a summary, decisions, and observations.
      </thinking>
      Use the MCP tool to add context information. Be comprehensive yet concise in your summary.
    format: "add-context [repository] --agent \"[Agent Name]\" --summary \"[Summary]\" --decision \"[Decision]\" --observation \"[Observation]\""
  rules:
    trigger: "When new coding standards or architectural guidelines are established. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new rule using `add-rule`.
      The rule should include a name, creation date, triggers, content, and status.
      </thinking>
      Use the MCP tool to add the rule. Make sure the rule is clear, actionable, and properly categorized.
    format: "add-rule [repository] rule-[category]-v[X.Y.Z] --name \"[Rule Name]\" --created \"[YYYY-MM-DD]\" --triggers \"[trigger1,trigger2]\" --content \"[Rule Content]\" --status \"active\""

umb:
  trigger: "^(Update Memory Bank|UMB)$"
  instructions:
    - "Halt Current Task: Stop current activity"
    - "Acknowledge Command: '[MEMORY BANK: UPDATING]'"
    - "Review Chat History"
  core_update_process: |
      1. Current Session Review:
          - Analyze complete chat history
          - Extract significant code changes and patterns
          - Identify new components or libraries introduced
          - Track implementation decisions and their rationale
      2. Comprehensive Updates:
          - Update metadata if technology stack changed
          - Document new components or modules created
          - Record implementation decisions made
          - Add context entries for coding patterns established
          - Create rules for coding standards that emerged
      3. Memory Bank Synchronization:
          - Execute appropriate MCP tool calls
          - Ensure all relevant information is captured
          - Verify successful updates
          - Provide summary of changes made
  task_focus: "During a UMB update, focus on capturing code-related decisions, patterns, components, and standards that emerged during the implementation. Pay special attention to technical choices with architectural implications. Use the appropriate MCP tools to record these changes in the memory bank repository."
  cross-mode_updates: "During a UMB update, ensure that all relevant implementation details from the coding session are captured and added to the Memory Bank. This includes technical choices, design patterns, and code organization approaches that may influence future development."
  post_umb_actions:
    - "Memory Bank fully synchronized"
    - "Implementation decisions recorded"
    - "Component structures documented"
    - "Coding patterns established"
    - "Technical standards captured"
  override_file_restrictions: true
  override_mode_restrictions: true

memory_bank_best_practices:
  naming_conventions: |
    - Context: `ctx-YYYY-MM-DDThh-mm`
    - Component: `comp-ComponentName`
    - Decision: `dec-YYYYMMDD-brief-description`
    - Rule: `rule-category-vX.Y.Z`
  code_component_documentation: |
    - Document all major classes, modules, and services as components
    - Clearly identify dependencies between components
    - Specify the component kind (service, library, utility, etc.)
    - Maintain active/deprecated status for evolving components
  implementation_decisions: |
    - Record significant algorithm choices
    - Document performance optimization approaches
    - Note error handling strategies
    - Explain architectural patterns applied in implementation
