# modz

Mods for [Claude Code](https://claude.com/claude-code): small plugins that add UI and behavior to the CLI and the desktop Code tab.

## Install

Everything at once:

```
/plugin install modz --marketplace katipally/modz
```

Or one mod at a time, in any Claude Code session:

```
/plugin install <mod> --marketplace katipally/modz
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

## Update

Installed mods do not update on their own. Refresh the marketplace, update each mod you have, then restart every running session:

```
claude plugin marketplace update modz
claude plugin update orchestrator@modz
claude plugin update usage-limits@modz
claude plugin update cache-timer@modz
claude plugin update model-info@modz
claude plugin update buddy@modz
```

- The `modz` bundle installs each mod as its own plugin, so update the mods by name as above.
- A mod that is already on the newest version says so; that is fine.
- Check with `claude plugin list`: each mod's version should match its `plugin.json` here.
- A second Claude config (`CLAUDE_CONFIG_DIR`, or a shell alias that sets it) keeps its own installs: run the same commands through it, e.g. `CLAUDE_CONFIG_DIR=~/.claude-work claude plugin update buddy@modz`.
- If you disabled a mod (for testing, say), `claude plugin enable <mod>@modz` turns it back on.

## Mods

| Mod | Category | What it does |
| --- | --- | --- |
| [modz](mods/bundle/modz) | bundle | All the mods below in one install |
| [orchestrator](mods/agents/orchestrator) | agents | Orchestrator menu: the main agent delegates all reads and writes; models, agents at once and a context cap per subagent are enforced |
| [usage-limits](mods/ui/usage-limits) | ui | Context bar plus 5h and 7d limits with time left until reset |
| [cache-timer](mods/ui/cache-timer) | ui | Cache hit % and time until the cache goes cold |
| [model-info](mods/ui/model-info) | ui | Model and thinking effort pickers |
| [buddy](mods/ui/buddy) | ui | Clawd, Claude Code's mascot, animated: blinks, walks while working, cheers when done |

## How mods share the screen

Mods that draw above the prompt place a tile in one shared band (`modz-band`): a lead column for the bot, then one column of tiles in a fixed order. Each mod's `SLOTS` says where it goes (`lead`, `left`, or `right`), and a column with no tiles is not drawn.

```
  [bot]    ctx   ███░░░░░░░ 26%   5h 4% · 4h 35m   7d 7% · 6d 17h
           cache 99% ✦ · 58m
           Opus 5.5 ▾   medium ▾ ✓
           ● Orchestrator ON   Settings ▾   ⠹ 2/2 running
```

Each tile has its own Claude theme color (usage `claude`, cache `suggestion`, model `merged`, orchestrator `planMode`). Labels and details are dim, values bold. Usage values turn yellow at 60% and red at 85%; the cache time is red once cold.

Small animations play only while something happens: the bot (real pixels, five moods, six skins) acts out fifteen kinds of work with their own props (typing, tests, git, installs, builds, editing, reading, browsing, helpers, checklists, questions, MCP, skills, plan mode and thinking), plays one of 14 click animations from a shuffled deck, jumps when a turn ends, shakes its head when stopped, sweats near a limit, checks a clock on a slow tool, shivers when the cache is cold and dozes off when idle; the context bar grows to its new value, the cache twinkles after a hit, a check pops in after a model or effort switch, and the orchestrator spins while its subagents run.

A new mod that draws above the prompt copies the `pack` helper from any of these mods and adds itself to `SLOTS` in all of them.

## Layout

```
modz/
├─ .claude-plugin/marketplace.json   every mod listed here
├─ mods/
│  ├─ bundle/     one install for a set of mods
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
5. Bump `version` in the mod's `plugin.json` on every change, or installed copies never update.

Run a mod from its folder without installing it, in its own terminal (not through `!` inside a session, which has no terminal to draw in):

```
claude --plugin-dir mods/<category>/<mod>
```

To test a change to a mod you already have installed, disable the installed copy first so the two do not both load, and enable it again once you have pushed and updated:

```
claude plugin disable <mod>@modz
claude --plugin-dir mods/<category>/<mod>
# after pushing:
claude plugin marketplace update modz && claude plugin update <mod>@modz && claude plugin enable <mod>@modz
```
