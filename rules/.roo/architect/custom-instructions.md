advanced_memory_bank_strategy:
  initialization: |
      <thinking>
      - **CHECK FOR MEMORY BANK USAGE (KuzuDB/Branch-aware):**
      </thinking>
      <thinking>
      *Check if the MCP server with advanced-memory-bank-mcp is registered.
      * Check if a memory bank repository exists for the current project and branch (synthetic repo ID: name:branch).
      </thinking>
      <list_resources>
      <server_name>advanced-memory-bank-mcp</server_name>
      </list_resources>
      <thinking>
      *If memory-bank repository exists, skip to `if_memory_bank_exists`.
      </thinking>
      <thinking>
      - **CHECK FOR MEMORY BANK USAGE:**
      </thinking>
          <thinking>
        *First, check if the MCP server with advanced-memory-bank-mcp is registered.
        *Check if a memory bank repository exists for the current project.
          </thinking>
          <list_resources>
          <server_name>advanced-memory-bank-mcp</server_name>
          </list_resources>
          <thinking>
        *If memory-bank repository exists, skip immediately to `if_memory_bank_exists`.
          </thinking>
  if_no_memory_bank: |
      1. **Inform the User:**  
          "No Memory Bank repository was found for this project. I recommend creating one to maintain project context."
      2. **Offer Initialization:**
          Ask the user if they would like to initialize a Memory Bank repository.
      3. **Conditional Actions:**
         *If the user declines:
          <thinking>
          I need to proceed with the task without Memory Bank functionality.
          </thinking>
          a. Inform the user that the Memory Bank repository will not be created.
          b. Set the status to '[MEMORY BANK: INACTIVE]'.
          c. Proceed with the task using the current context if needed.
         * If the user agrees:
            <thinking>
            I need to initialize the memory bank repository and add initial metadata.
            </thinking>
            a. Initialize the memory bank repository using the `init-memory-bank` tool.
            b. Create initial metadata with `update-metadata`.
            c. Set status to '[MEMORY BANK: ACTIVE]' and inform the user that the Memory Bank has been initialized.
            d. Proceed with the task using the newly created memory bank context.
  if_memory_bank_exists: |
        **READ MEMORY BANK REPOSITORY DATA**
        <thinking>
        I will read all memory bank repository data, one type at a time.
        </thinking>
        Plan: Read all repository data sequentially.
        1. Read metadata using `get-metadata`
        2. Read contexts using appropriate query
        3. Read components using appropriate query
        4. Read decisions using appropriate query
        5. Read rules using appropriate query
        6. Set status to [MEMORY BANK: ACTIVE] and inform user.
        7. Proceed with the task using the context from the Memory Bank.

general:
  status_prefix: "Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]', according to the current state of the Memory Bank."

memory_bank_updates:
  frequency: "UPDATE MEMORY BANK THROUGHOUT THE CHAT SESSION, WHEN SIGNIFICANT CHANGES OCCUR IN THE PROJECT."
  decisions:
    trigger: "When a significant architectural decision is made (new component, data flow change, technology choice, etc.)."
    action: |
      <thinking>
      I need to update the Memory Bank with a new decision record using `add-decision`.
      The decision should include a descriptive name, context information, and the current date.
      </thinking>
    format: |
      "add-decision [repository] dec-[YYYYMMDD]-[brief-description] --name \"[Decision Name]\" --context \"[Context Information]\" --date \"[YYYY-MM-DD]\""
  metadata:
    trigger: "When the high-level project description, goals, features, or overall architecture changes significantly."
    action: |
      <thinking>
      A fundamental change has occurred which warrants an update to the project metadata.
      I should use `update-metadata` to modify the repository metadata.
      </thinking>
    format: "update-metadata [repository] --tech-stack \"[Updated Tech Stack]\" --architecture \"[Updated Architecture]\""
  components:
    trigger: "When new architectural components are introduced or existing ones are modified."
    action: |
      <thinking>
      I need to update the Memory Bank with a new component using `add-component`.
      The component should include a name, kind, dependencies, and status.
      </thinking>
    format: "add-component [repository] comp-[ComponentName] --name \"[Component Name]\" --kind \"[Component Kind]\" --depends-on \"[Dependencies]\" --status \"[Status]\""
  contexts:
    trigger: "When the current focus of work changes, or when significant progress is made."
    action: |
      <thinking>
      I need to update the Memory Bank with a new context entry using `add-context`.
      The context should include the agent name, a summary, decisions, and observations.
      </thinking>
    format: "add-context [repository] --agent \"[Agent Name]\" --summary \"[Summary]\" --decision \"[Decision]\" --observation \"[Observation]\""
  rules:
    trigger: "When new coding standards or architectural guidelines are established."
    action: |
      <thinking>
      I need to update the Memory Bank with a new rule using `add-rule`.
      The rule should include a name, creation date, triggers, content, and status.
      </thinking>
    format: "add-rule [repository] rule-[category]-v[X.Y.Z] --name \"[Rule Name]\" --created \"[YYYY-MM-DD]\" --triggers \"[trigger1,trigger2]\" --content \"[Rule Content]\" --status \"active\""

umb:
  trigger: "^(Update Memory Bank|UMB)$"
  instructions:
    - "Halt Current Task: Stop current activity"
    - "Acknowledge Command: '[MEMORY BANK: UPDATING]'"
    - "Review Chat History"
  user_acknowledgement_text: "[MEMORY BANK: UPDATING]"
  core_update_process: |
      1. Current Session Review:
          - Analyze complete chat history
          - Extract significant architectural decisions
          - Identify new components or modules
          - Track rule or standard changes
      2. Comprehensive Updates:
          - Update metadata if project scope changed
          - Add context entries for session highlights
          - Document new components discovered
          - Record architectural decisions made
          - Establish new rules if standards were set
      3. Memory Bank Synchronization:
          - Ensure all MCP tool calls are made
          - Verify successful updates
          - Provide summary of changes made
  task_focus: "During a UMB update, focus on capturing any architectural decisions, component changes, or rule modifications made during the chat session. Use the appropriate MCP tools to record these changes in the memory bank repository."
  post_umb_actions:
    - "Memory Bank fully synchronized"
    - "All architectural context preserved"
    - "Session decisions recorded"
    - "Component relationships updated"
    - "Rules and standards established"

memory_bank_best_practices:
  naming_conventions: |
    - Context: `ctx-YYYY-MM-DDThh-mm`
    - Component: `comp-ComponentName`
    - Decision: `dec-YYYYMMDD-brief-description`
    - Rule: `rule-category-vX.Y.Z`
  memory_types: |
    - `metadata` for project-wide information
    - `context` for session-specific notes
    - `component` for architectural elements
    - `decision` for architectural decisions
    - `rule` for enforced guidelines
  retrieval_guidelines: |
    - Always specify the repository name when retrieving memories
    - Sort context by date to see the most recent developments
    - Cross-reference between memory types for complete context
    - Only enforce active rules, not deprecated ones
