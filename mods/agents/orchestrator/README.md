# orchestrator

An Orchestrator switch above the prompt. The main agent delegates all reads and writes to subagents; models, how many run at once and each subagent's context are enforced.

## Install

```
/plugin install orchestrator --marketplace katipally/modz
```

Update, then restart your sessions (more in the [main README](../../../README.md#update)):

```
claude plugin marketplace update modz
claude plugin update orchestrator@modz
```

## Use

```
● Orchestrator ON   Settings ▴   ⠹ 2/2 running   Save as default   Reset
  Models          ☑ Opus   ☑ Sonnet   ☐ Haiku
  Agents at once  ○ 1  ● 2  ○ 3  ○ 4  ○ Custom…
  Context limit   ● 200k  ○ 400k  ○ Custom…
  Main agent      ☑ Delegates reads & writes
```

- Every prompt you type gets a hidden orchestrator brief with your current settings. Subagents never see it.
- Delegation: with `Delegates reads & writes` ticked, the main agent is refused Read, Write, Edit, NotebookEdit, Glob, Grep and Bash. Subagents keep them.
- Subagent spawns are checked: unticked models, a spawn while the max are already running, and subagents spawning subagents are refused. The max counts agents running at the same time, so a finished one frees its slot. Messaging a finished subagent resumes it, and that counts too.
- Context limit is per subagent. When a subagent's context (input, cache and output tokens of a step) reaches it, its tools are refused so it reports, and the main agent cannot message it again; it spawns a fresh one instead.
- `Save as default` keeps your settings across sessions and shows `✓ Default` while they match; `Reset` restores the saved ones.
- `Orchestrator ON/OFF` toggles with one click; `Settings` shows or hides the rows below it.
- Custom… opens a box to type a value; Cancel or closing Settings drops it.
- Without the dropdown (VS Code, mobile): `/orch on|off`, `/orch max=4 ctx=300k models=sonnet,haiku delegate=off`, `/orch save`, `/orch reset`.
- In the terminal every option is a button you click, the chosen one marked ● (a terminal Select only answers the keyboard). Other surfaces use their native dropdown.
