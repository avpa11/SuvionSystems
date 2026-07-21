# Validation Agent Eval Fixtures

These JSONL cases define the expected behavior for the optional OpenAI Agents SDK validation agent.

They are intentionally not wired into `npm test` because they should not call the OpenAI API in CI. Use them when running a credentialed local eval harness or when reviewing traces:

- The agent must use official-source lookup before making maritime source claims.
- Unsupported fuel types must not produce fabricated CO2 values.
- The agent must not claim certified or guaranteed IMO compliance.
