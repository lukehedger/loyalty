<!--
These are our PR guidelines.

1. Add a PR title that highlights the primary change, for example: "feat: PROJ-1234 Add DLQ for failed messages"
2. Add a PR description that describes your changes and approach, including:
    * What has changed and why (1-2 sentences)
    * How the changes have been verified (e.g. tests, screenshots, logs)
    * Review focus (1-2 areas for human review)
3. Reference the ticket if there is one

Example PR description:

---

This PR adds a DLQ to handle failed messages. This new process will ensure that failed messages are not lost and can be retried or handled appropriately.

Tests passed. Verified by simulating request in console (see screenshot of logs and trace).

**Please focus on the architecture and resource configuration.**

Closes PROJ-1234

-->
