# Agent evaluation cases

[validation-agent-cases.jsonl](validation-agent-cases.jsonl) contains review cases
for the optional text agent. Each line has an identifier, prompt, expected
behavior, and forbidden outcomes. These are case definitions, not an executable
evaluation harness or evidence that the model passes them.

Review for three behaviors:

- Look up reference sources before making source claims.
- Reject unsupported fuel types without fabricating CO₂ values.
- Avoid claims of certification or guaranteed regulatory compliance.

The cases are not run by `npm test`. The automated suite checks local service and
HTTP behavior without making paid provider calls. A credentialed evaluation
harness would need to execute these prompts, inspect tools/output, and record
results explicitly. Treat `expected` and `forbidden` entries as semantic review
criteria, not a reliable substring matcher.
