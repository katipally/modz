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
| types on a laptop, eyes down, screen glow flickering | Bash runs |
| swings a hammer, sparks fly | Edit, Write or NotebookEdit runs |
| peers through a magnifying glass, his eye big behind it | Read, Grep or Glob runs |
| antenna up, signal waves | WebFetch or WebSearch runs |
| little helpers hop beside him | an Agent (subagent) runs |
| ticks a checklist | TodoWrite or a task tool runs |
| steps in place, thought bubbles rise | thinking, no tool running |
| jumps with arms up, gold crown, confetti | a turn finished |
| eyes shut, a red `!` flashes, shakes his head | a turn was stopped or errored |
| nightcap, sits down | 2 minutes with nothing happening |
| blinks, glances both ways, waves | idle |

**Click him** and he jumps with a heart, whatever he is doing.

On top of his mood, three things can bother him (idle or working):

| What he does | When |
| --- | --- |
| sweat runs down his side | any limit or the context is at 85% or more |
| a clock hand turns beside him | one tool has run for 10 seconds (delegating does not count) |
| snow drifts down and he shivers | the prompt cache has gone cold (needs the cache-timer mod) |

Everything he holds stays inside his own box, so the band never changes size. The frames never redraw the band:

- Terminal: Clawd is the three-row Clawd from Claude Code's welcome screen. Each kind of work has its own prop beside him, drawn in cells and moving on its own beat (code lines for typing, a swinging hammer, a lens sliding across, signal waves, hopping helpers, a checklist ticking, a rising bubble), with the work written next to it (`⌨ typing`, `✎ editing`, `⌕ reading`, `◎ browsing`, `⚑ delegating`, `☑ planning`). Only thinking paces on his feet, and a head shake moves the head alone. He runs as a `Client` region on his own clock, so only his cells repaint. Clicks need the fullscreen terminal (`"tui": "fullscreen"`).
- Desktop, VS Code, mobile: one Svg per mood that animates itself (SMIL), with the click reaction built in.
- With reduced motion on, he holds still.

Styles: `/buddy skin classic | ink | mint | sky | berry | gold` (classic is Clawd's own color; the choice is remembered).

Only the main agent's turns and tools move him; subagents do not.
