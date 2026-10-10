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
| types, code lines scroll, arms alternate | an ordinary Bash command |
| progress bar fills, foot taps | tests run (`npm test`, `pytest`, ...) |
| a commit dot hops along a branch | a `git` command |
| a package drops into a box | `npm install`, `pip install`, `brew install`, ... |
| gears turn, he cranks | `build`, `tsc`, `make`, ... |
| swings a hammer, sparks fly | Edit, Write or NotebookEdit runs |
| a lens slides across, his eyes follow | Read, Grep or Glob runs |
| signal waves grow | WebFetch or WebSearch runs |
| little helpers hop beside him | an Agent (subagent) runs |
| ticks a checklist | TodoWrite or a task tool runs |
| a `?` bounces, his hand is up | he is asking you a question |
| a plug clicks into a socket | an MCP tool runs |
| waves a wand, sparkles | a skill runs |
| ponders, a bulb lights | entering or leaving plan mode |
| paces, looks around, a bubble rises | thinking, no tool running |
| hops with arms up, sparks fly | a turn finished |
| eyes shut, flails, a red `!` flashes | a turn was stopped or errored |
| sits down, `z` rises | 2 minutes with nothing happening |
| blinks, glances both ways, waves hello | idle |

**Click him** and he plays one of 14 animations: jump, look, spin, peekaboo, drop, wink, boop, tap, sneeze, turn, coin-hop, skip, waddle or peek. They come from a shuffled deck, so every one plays before any repeats and never the same one twice in a row. Clicks during an animation are ignored. (Terminal only; the pixel version keeps one hop.)

On top of his mood, three things can bother him (idle or working):

| What he does | When |
| --- | --- |
| sweat runs down his side | any limit or the context is at 85% or more |
| a clock hand turns beside him | one tool has run for 10 seconds (delegating does not count) |
| snow drifts down and he shivers | the prompt cache has gone cold (needs the cache-timer mod) |

Everything he holds stays inside his own box, so the band never changes size. The frames never redraw the band:

- Terminal: Clawd is the three-row Clawd from Claude Code's welcome screen. Each kind of work has its own prop beside him, drawn in cells and moving on its own beat, with the work written next to it (`⌨ typing`, `✎ editing`, `⌕ reading`, `◎ browsing`, `⚑ delegating`, `☑ planning`, `◔ testing`, `◆ git`, `↓ installing`, `▤ building`, `? asking`, `↯ connecting`, `✦ casting`, `◇ drafting`). Only thinking paces on his feet. He sits in a box of nine cells by three rows, and a frame may push him down or sideways inside it, which clips him: that is how he hides, peeks and walks out of sight without the band ever changing size. He runs as a `Client` region on his own clock, so only his cells repaint. Clicks need the fullscreen terminal (`"tui": "fullscreen"`).
- Desktop, VS Code, mobile: one Svg per mood that animates itself (SMIL), with the click reaction built in.
- With reduced motion on, he holds still.

Styles: `/buddy skin classic | ink | mint | sky | berry | gold` (classic is Clawd's own color; the choice is remembered).

Only the main agent's turns and tools move him; subagents do not.
