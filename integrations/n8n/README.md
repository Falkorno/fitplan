# Stride Fitness Coach bridge

Import `stride-fitness-coach.workflow.json` into n8n. The workflow stores only the latest coaching context and report for each target week in workflow static data.

Before activation:

1. Create an n8n Header Auth credential named `Stride Coach Webhook`.
2. Use header name `X-Stride-Coach-Key` and generate a long random value.
3. Open each of the four Webhook nodes, select that credential, and save.
4. Activate the workflow and copy its production webhook URLs.
5. Never paste the shared key into this repository.

The production endpoints are expected to be:

- `POST /webhook/stride-coach/context`
- `GET /webhook/stride-coach/context`
- `POST /webhook/stride-coach/report`
- `GET /webhook/stride-coach/report`

The Custom GPT only needs the GET context and POST report operations in `custom-gpt-action.openapi.yaml`. The app uses the other two operations.

Workflow static data is deliberately modest here: one context and one report per target week, with old entries pruned. If this later becomes multi-user, replace it with an n8n Data Table keyed by authenticated user ID.
