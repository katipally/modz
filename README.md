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
| [cache-timer](mods/ui/cache-timer) | ui | Cache hit % and time until the cache goes cold |
| [model-info](mods/ui/model-info) | ui | Model and thinking effort pickers |
| [buddy](mods/ui/buddy) | ui | Claude Code's bot, animated: blinks, walks while working, hops when done |

## How mods share the screen

Mods that draw above the prompt place a tile in one shared band (`modz-band`): a lead column for the bot, then one column of tiles in a fixed order. Each mod's `SLOTS` says where it goes (`lead`, `left`, or `right`), and a column with no tiles is not drawn.

```
  ▐▛███▜▌    ctx   ███░░░░░░░ 26%   5h 4% · 4h 35m   7d 7% · 6d 17h
 ▝▜█████▛▘   cache 99% ✦ · 58m
   ▘▘ ▝▝     Opus 5.5 ▾   medium ▾ ✓
           Orchestrator on ▾   ⠹ 2 running
```

Each tile has its own Claude theme color (usage `claude`, cache `suggestion`, model `merged`, orchestrator `planMode`). Labels and details are dim, values bold. Usage values turn yellow at 60% and red at 85%; the cache time is red once cold.

Small animations play only while something happens: the bot walks during a turn and hops when it ends, the context bar grows to its new value, the cache twinkles after a hit, a check pops in after a model or effort switch, and the orchestrator spins while its subagents run.

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
