# Buddy animation board (sources)

Design-canvas sources of the live board at https://claude.ai/artifact/3AXZSQb1dtjnwbAKthTegf. The board is private to its owner, so opening that link needs access.

These files only run inside that canvas: each page loads `./support.js` from it, which is not in this repo. Opening them from disk shows nothing useful. They are kept here so the board is documented and can be republished.

The Proposals board is now implemented as cues in the mod. What shipped, with real triggers and generated frames: [../SPRITES.md#cues](../SPRITES.md#cues). The board stays as the design source.

Everything here is a design reference. The generated sheets in [../sheets](../sheets) come from the mod's real code and are what [../SPRITES.md](../SPRITES.md) shows.

| File | Board | What it shows |
| --- | --- | --- |
| `canvas.json` | Buddy Animation Board | Canvas manifest: the three boards, their positions and sizes, order |
| `Main.dc.html` | Terminal: current | The terminal Clawd: moods, work modes (one prop per kind of work), strain reactions, and the click animations, with timings |
| `Pixel.dc.html` | Pixel: current | The pixel Clawd used on desktop, VS Code and mobile: moods, props, skins, ported from `hooks/clawd.ts` |
| `Proposals.dc.html` | Proposed new animations | 12 proposed states (permission wait, tool error, test verdict, compacting, rate limited, subagents running, long tool run, reading a big file, offline, git commit, session greeting, long task finished), each with trigger, why, and all frames |
