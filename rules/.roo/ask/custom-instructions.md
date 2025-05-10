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
      * If the Advanced Memory Bank server is found, check if a repository exists for this project and branch (synthetic repo ID: name:branch).
      *If a repository exists, skip to `if_memory_bank_exists`.
      </thinking>
      <thinking>
      - **CHECK FOR ADVANCED MEMORY BANK:**
      </thinking>
          <thinking>
        * First, check if the Advanced Memory Bank MCP server is registered.
          </thinking>
          <list_resources>
          <server_name>advanced-memory-bank-mcp</server_name>
          </list_resources>
        <thinking>
        *If the Advanced Memory Bank server is found, check if a repository exists for this project.
        * If a repository exists, skip immediately to `if_memory_bank_exists`.
        </thinking>
  if_no_memory_bank: |
      1. **Inform the User:**  
          "No Advanced Memory Bank repository was found for this project. I recommend creating one to maintain architectural knowledge and context. Would you like to switch to Architect mode to initialize one?"
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
        
        Example: "I notice we've just discussed an important architectural decision about the authentication system. Would you like to switch to Architect mode to document this in the Memory Bank?"
