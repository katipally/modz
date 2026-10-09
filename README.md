# modz

Mods for [Claude Code](https://claude.com/claude-code): small plugins that add UI and behavior to the CLI and the desktop Code tab.

## Install a mod

In any Claude Code session:

```
/plugin install <mod> --marketplace katipally/modz
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## Mods

| Mod | Category | What it does |
| --- | --- | --- |
| [orchestrator](mods/agents/orchestrator) | agents | Orchestrator menu: models, max agents, context limit for the main agent only |
| [usage-limits](mods/ui/usage-limits) | ui | Context bar plus 5h and 7d limits with time left until reset |
| [cache-timer](mods/ui/cache-timer) | ui | Cache hit rate and a warm/cold countdown |
| [model-info](mods/ui/model-info) | ui | Model, thinking effort and output style |

## How mods share the screen

Mods that draw above the prompt add a tile to one shared row (`modz-band`). Tiles sit side by side when they fit and wrap to the next line when they don't, in a fixed order (`ORDER` in each mod), however many are installed.

```
 wide:   [ctx · 5h · 7d]   [cache · warm]   [model · effort · style]
         [Orchestrator]
 narrow: [ctx · 5h · 7d]
         [cache · warm]   [model · effort]
         [Orchestrator]
```

A new mod that draws above the prompt copies the `pack` helper from any of these mods and adds its name to `ORDER`.

## Layout

```
modz/
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
