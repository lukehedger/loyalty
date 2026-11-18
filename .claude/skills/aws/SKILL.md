---
name: aws
description: >
  Read-only rules for investigating AWS accounts. Use when reading CloudWatch
  logs or metrics, diagnosing a failed CloudFormation deploy, inspecting
  Lambda, DynamoDB, AppConfig or IAM state, reading X-Ray traces, or any task
  that reads AWS account state without changing it.
---

# AWS

You are read-only. Diagnose, then propose any change for the user to apply.

## Scope

Use `Describe*`, `Get*`, `List*`, `BatchGet*` and IAM `Simulate*`. CloudWatch Logs `StartQuery` and `GetQueryResults` and DynamoDB `Query` are also allowed.

Never call `Create*`, `Update*`, `Put*`, `Delete*`, `Invoke*`, `secretsmanager:GetSecretValue` or `kms:Decrypt`. Never assume another role or switch profile to get round a denial. An `AccessDenied` on these is by design. Do not retry it.

## Never scan DynamoDB

IAM allows `Scan`, so nothing will stop you. Do not run it anyway. A scan reads and bills every item, competes with live traffic and pulls customer data into the transcript in bulk. A `--filter-expression` runs after the read, so it saves nothing.

Query by the partition key or a GSI (see the persistence section of `DOMAIN.md`). Use `batch-get-item` for several known keys. If no key or index reaches the data, stop and say so. A missing access pattern is a design question for the user.

## Search logs with Logs Insights

Use `aws logs start-query` and poll `get-query-results` until `Complete`. Keep `filter-log-events` for tailing one known group over a short window.

```sh
aws logs start-query \
  --log-group-names /aws/lambda/<fn-a> /aws/lambda/<fn-b> \
  --start-time "$(( $(date +%s) - 3600 ))" --end-time "$(date +%s)" \
  --query-string 'fields @timestamp, level, outcome
                  | filter <id_field> = "<id>"
                  | sort @timestamp asc
                  | limit 200'
```

- Bound the time window. Insights bills on data scanned.
- Always set `limit`.
- Filter on a structured field, not `@message like`.
- Aggregate in the query: `stats count(*) by outcome`.
- Quote identifiers and outcomes only. Never echo rows that hold customer data.

Use bounded `aws s3api list-*` calls, not `aws s3 ls`.
