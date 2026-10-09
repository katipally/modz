# Yash-mods

Mods for [Claude Code](https://claude.com/claude-code): small plugins that add UI and behavior to the CLI and the desktop Code tab.

## Install

In any Claude Code session, run:

```
/plugin install <mod> --marketplace yashwanthkatipally/Yash-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## Mods

| Mod | What it does |
| --- | --- |
| [orchestrator](mods/orchestrator) | An Orchestrator button above the prompt. Pick models, max agents and context limit; only the main agent gets the brief, and subagent limits are enforced. |

### orchestrator

```
[ ● Orchestrator: ON  ▴ ]   Save as default
  Mode           On ▾
  Models         ☑ Opus   ☑ Sonnet   ☐ Haiku
  Max agents     2 agents ▾        (1, 2, Custom…)
  Context limit  200k tokens ▾     (200k, 400k, Custom…)
```

- Every prompt you type gets a hidden orchestrator brief with your current settings. Subagents never see it.
- Subagent spawns are checked: unticked models, spawns past the max, and subagents spawning subagents are refused.
- The context limit is an instruction to the orchestrator, not a hard cap.
- `Save as default` keeps your settings across sessions.
- Without the button (VS Code, mobile): `/orch on|off`, `/orch max=4 ctx=300k models=sonnet,haiku`, `/orch save`, `/orch reset`.

## Develop

```
mods/<mod>/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.tsx
  types/index.d.ts
  tests/*.test.ts
```

Run a mod from this folder without installing it:

```
claude --plugin-dir mods/<mod>
```

Check and test it:

```
claude plugin validate mods/<mod>
claude plugin test mods/<mod>
```

To add a mod, put it under `mods/` and list it in `.claude-plugin/marketplace.json`.
