# orchestrator

An Orchestrator button above the prompt. Pick models, max agents and context limit; only the main agent gets the brief, and subagent limits are enforced.

## Install

```
/plugin install orchestrator --marketplace katipally/modz
```

## Use

```
Orchestrator on ▾   Save as default        (dropdown: On · Off · Settings…)
  Models         ☑ Opus   ☑ Sonnet   ☐ Haiku
  Max agents     2 agents ▾        (1, 2, Custom…)
  Context limit  200k tokens ▾     (200k, 400k, Custom…)
```

- Every prompt you type gets a hidden orchestrator brief with your current settings. Subagents never see it.
- Subagent spawns are checked: unticked models, spawns past the max, and subagents spawning subagents are refused.
- The context limit is an instruction to the orchestrator, not a hard cap.
- `Save as default` keeps your settings across sessions.
- Pick Settings… in the dropdown to show or hide the rows below it.
- Without the dropdown (VS Code, mobile): `/orch on|off`, `/orch max=4 ctx=300k models=sonnet,haiku`, `/orch save`, `/orch reset`.
