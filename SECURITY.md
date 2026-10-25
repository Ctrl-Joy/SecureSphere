# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the project maintainer rather than opening a
public issue. Include:

- a description and the affected endpoint or component,
- steps to reproduce (requests, payloads, expected vs. actual behaviour),
- the impact as you understand it.

You will receive an acknowledgement within 5 working days. Please give us a reasonable time to fix
the issue before any public disclosure.

## Testing rules

Only test against a deployment you run yourself (for example `docker compose up` locally). Do not
run scanners or attacks against deployments you are not explicitly authorized to test, and never
access or modify other people's data.

## Scope

In scope: the backend API, the frontend application, the Docker and nginx configuration in this
repository. The **security lab** intentionally *displays* vulnerable patterns as text; a report is
valid if you can make the lab *execute* injected SQL or script, or reach data outside its isolated
demo dataset.
