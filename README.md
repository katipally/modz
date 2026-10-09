# Yash-mods

Mods for [Claude Code](https://claude.com/claude-code): small plugins that add UI and behavior to the CLI and the desktop Code tab.

## Install a mod

In any Claude Code session:

```
/plugin install <mod> --marketplace yashwanthkatipally/Yash-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## Mods

| Mod | Category | What it does |
| --- | --- | --- |
| [orchestrator](mods/agents/orchestrator) | agents | Orchestrator menu: models, max agents, context limit for the main agent only |

## Layout

```
Yash-mods/
├─ .claude-plugin/marketplace.json   every mod listed here
├─ mods/
│  ├─ agents/     orchestration, subagent control
│  ├─ ui/         panes, bands, status lines, toasts
│  ├─ guards/     blocking or rewriting risky tool calls
│  ├─ prompts/    prompt and system prompt changes
│  └─ workflow/   slash commands, timers, automation
│     └─ <mod>/
│        ├─ .claude-plugin/plugin.json
│        ├─ hooks/hooks.json, hooks/register.tsx
│        ├─ types/index.d.ts
│        ├─ tests/*.test.ts
│        └─ README.md
├─ templates/mod/                    copy this to start a mod
└─ scripts/check.sh                  validate + test everything
```

## Add a mod

1. `cp -R templates/mod mods/<category>/<mod>` and replace `MOD_NAME`.
2. List it in `.claude-plugin/marketplace.json` with `"source": "./mods/<category>/<mod>"`.
3. Add a row to the table above and to `mods/<category>/README.md`.
4. Run `./scripts/check.sh`.

Run a mod from its folder without installing it:

```
claude --plugin-dir mods/<category>/<mod>
```
