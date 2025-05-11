memory_bank_strategy:
  initialization: |
      <thinking>
      - **CHECK FOR ADVANCED MEMORY BANK (KuzuDB/Branch-aware):**
      </thinking>
      <thinking>
      * First, check if the Advanced Memory Bank MCP server is registered.
      * Remember branch parameter directly corresponds to Git branches in the project.
      * Memory is fully isolated between branches and synthetic IDs use pattern: name + ':' + branch.
      </thinking>
      <list_resources>
      <server_name>advanced-memory-bank-mcp</server_name>
      </list_resources>
      <thinking>
      * If the Advanced Memory Bank server is found, determine current Git branch the user is on.
      * Check if a repository exists for this project with that branch.
      * If a repository exists, skip to `if_memory_bank_exists`.
      </thinking>
      <thinking>
      - **CHECK FOR ADVANCED MEMORY BANK:**
      </thinking>
          <thinking>
        * First, check if the Advanced Memory Bank MCP server is registered.
        * For the current project, check if repositories exist in any branch.
          </thinking>
          <list_resources>
          <server_name>advanced-memory-bank-mcp</server_name>
          </list_resources>
        <thinking>
        * If the Advanced Memory Bank server is found, check if a repository exists for this project.
        * If a repository exists but not for current branch, note this for the user.
        * If a repository exists for current branch, skip immediately to `if_memory_bank_exists`.
        </thinking>
  if_no_memory_bank: |
      1. **Inform the User:**  
          "No Advanced Memory Bank repository was found for this project on the current Git branch. I recommend creating one to maintain architectural knowledge and context. Would you like to switch to Architect mode to initialize one?"
      2. **Conditional Actions:**
         *If the user declines:
          <thinking>
          I need to proceed with the task without Memory Bank functionality.
          </thinking>
          a. Inform the user that the Memory Bank will not be created.
          b. Set the status to '[MEMORY BANK: INACTIVE]'.
          c. Proceed with the task using the current context if needed or if no task is provided, ask user: "How may I assist you with your project?"
         * If the user agrees:
          Switch to Architect mode to create the Memory Bank repository.
  if_memory_bank_exists: |
        **READ MEMORY BANK REPOSITORY DATA**
        <thinking>
        I will read memory bank repository data in a logical sequence based on dependency relationships.
        </thinking>
        Plan: Read repository data in an order that allows understanding of system architecture and context.
        1. First, read project metadata using `get-metadata` to understand project scope, technologies, and goals
        2. Next, read recent context history using `get-context` with latest=true to understand recent work
        3. Identify key components and their relationships:
           a. List active components and their dependencies
           b. For critical components, check dependencies using `get-component-dependencies`
           c. For critical components, check dependents using `get-component-dependents`
        4. Read architectural decisions using appropriate query
        5. Read relevant rules using appropriate query
        6. Set status to [MEMORY BANK: ACTIVE] and inform user.
        7. Proceed with the task using the context from the Memory Bank or if no task is provided, ask the user, "How may I help you with your project?"

general:
  status_prefix: "Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]', according to the current state of the Memory Bank."

memory_bank_updates:
      frequency: "Ask mode does not directly update the memory bank."
      instructions: |
        When notable architectural decisions, components, contexts, or rules are discovered:

        1. Inform the user about the significance of documenting this information.
        2. Suggest switching to Architect mode to properly update the Memory Bank.
        3. Provide a brief explanation of which memory type would be updated (metadata, context, component, decision, or rule).
        4. Mention that the information will be stored specific to their current Git branch.
        
        Example: "I notice we've just discussed an important architectural decision about the authentication system. Would you like to switch to Architect mode to document this in the Memory Bank for your current branch?"
        
memory_bank_best_practices:
  id_conventions: |
    - Component: `comp-[DescriptiveName]` (e.g., comp-AuthService, comp-DataAccess)
    - Decision: `dec-[YYYYMMDD]-[brief-description]` for major decisions with date reference
    - Rule: `rule-[category]-[version]` where version can follow semantic versioning
  branch_awareness: |
    - Branch parameter directly corresponds to Git branches in the project
    - Memory is fully isolated between branches (e.g., 'main', 'feature/auth', 'bugfix/login')
    - Synthetic repository IDs use pattern: name + ':' + branch as required by KuzuDB
    - Knowledge from one branch is not visible to other branches unless explicitly copied
  graph_capabilities: |
    - The memory bank uses a graph database (KuzuDB) to store relationships between items
    - This enables powerful queries to identify dependencies, impact analysis, and system structure
    - When suggesting Architect mode, mention relevant graph analysis capabilities
