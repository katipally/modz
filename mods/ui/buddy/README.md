# buddy

Claude Code's own bot, animated, at the left of the mod band above the prompt.

```
 ...###########...     drawn as real pixels: Raster cells in the terminal,
 ...##.#####.##...     a crisp Svg on desktop, VS Code and mobile
 ...##.#####.##...
 .###############.
 ...###########...
 ...#.#.....#.#...
 ...#.#.....#.#...
```

## Install

```
/plugin install buddy --marketplace katipally/modz
```

## Use

| Mood | When | What it does |
| --- | --- | --- |
| idle | between turns | blinks, glances left and right, waves now and then |
| working | while your turn runs | eyes focused, walks in place, `···` beside it |
| happy | a turn finished | jumps with arms up and squinting eyes, `✦` sparkles |
| oops | a turn was stopped or errored | eyes shut, shakes its head |
| asleep | 2 minutes with nothing happening | eyes shut, legs folded, `zZz` |

Styles: `/buddy skin classic | ink | mint | sky | berry | gold` (classic is Claude orange; the choice is remembered).

Only the main agent's turns move it; subagents finishing do not.
