---
title: Che-Code automatic rebase against upstream VS Code is failed
assignees: azatsarynnyy
labels: area/editor/che-code, kind/task, severity/P1, sprint/current, team/editors

---

### Is your task related to a problem? Please describe
The GitHub Workflow has been unable to update Che-Code with the latest VS Code patches and needs human attention.
The Workflow has been disabled.

### Describe the solution you'd like
1. See the output of [the failed job](https://github.com/che-incubator/che-code/actions/workflows/rebase-insiders.yml).
2. Perform the rebase manually (fixing the detected merge conflicts). For the detailed steps, see [the instructions](https://github.com/che-incubator/che-code#how-to-fix-the-rebase-insiders-workflow).
3. Enable the [GitHub Workflow](https://github.com/che-incubator/che-code/actions/workflows/rebase-insiders.yml).
