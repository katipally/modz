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

Clawd acts out what the agent is doing:

| What he does | When |
| --- | --- |
| types on a laptop while a line of text fills the screen | Bash runs |
| swings a hammer, sparks fly | Edit, Write or NotebookEdit runs |
| scans with a magnifying glass | Read, Grep, Glob, WebFetch or WebSearch runs |
| looks ahead, steps in place, thought bubbles rise | thinking, no tool running |
| jumps with arms up, gold crown, confetti | a turn finished |
| eyes shut, sweat drop, shakes his head | a turn was stopped or errored |
| nightcap, sits down, `zZz` | 2 minutes with nothing happening |
| blinks, glances around, waves | idle |

**Interaction:** press `♥` next to him to pet him: he jumps and a heart pops up. On desktop he also lifts when the pointer is over him and squishes when pressed.

Styles: `/buddy skin classic | ink | mint | sky | berry | gold` (classic is Clawd's own color; the choice is remembered).

Only the main agent's turns and tools move him; subagents do not.
