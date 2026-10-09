# buddy

Clawd, Claude Code's mascot, animated at the left of the mod band above the prompt. The pixels and colors are the ones Claude Code itself draws him with (its built-in mods guide), painted as Raster cells in the terminal and a crisp Svg on desktop, VS Code and mobile.

```
 ..CCCCCCCCCCCCC..
 ..CCCCCCCCCCCCC..
 ..CCCECCCCCCCEC..      C body #d77757
 ..CCCECCCCCCCEC..      E eyes #141414
 CCCCCCCCCCCCCCCCC
 CCCCCCCCCCCCCCCCC
 ..CCCCCCCCCCCCC..
 ..CCCCCCCCCCCCC..
 ..C.C.......C.C..
 ..C.C.......C.C..
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
| happy | a turn finished | cheers with arms up and squinting eyes, crouches and springs, `✦` sparkles |
| oops | a turn was stopped or errored | eyes shut, shakes his head |
| asleep | 2 minutes with nothing happening | eyes shut, legs folded, `zZz` |

Styles: `/buddy skin classic | ink | mint | sky | berry | gold` (classic is Clawd's own color; the choice is remembered).

Only the main agent's turns move it; subagents finishing do not.
