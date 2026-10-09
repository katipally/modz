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

Mods that draw above the prompt place a tile in one shared band (`modz-band`) with two columns: live metrics on the left, identity and controls on the right. Each mod's `SLOTS` says which column it takes and in what order.

```
 wide:    ctx   ▰▰▱▱▱▱▱▱ 26%   5h 4% · 4h 35m left   7d 7% · 6d 17h left      Opus 5.5 · medium · default
          cache 99% hit · 260k read · 468 new   ● warm · 58m left   ttl 1h          ● Orchestrator on ▾

 narrow:  the right column drops under the left one
 partial: a column with no tiles is not drawn; a lone column is left-aligned
```

One look for every tile: dim labels and details, bold values, and color only for status (green under 50%, yellow 50-79%, red 80%+).

A new mod that draws above the prompt copies the `pack` helper from any of these mods and adds itself to `SLOTS` in all of them.

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
