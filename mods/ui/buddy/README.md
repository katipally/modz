# buddy

A small animated bot that sits at the left of the mod band above the prompt.

```
 ▗▄▄▄▖         ▗▄▄▄▖ ··        ▗▄▄▄▖ ✦
 ▐●‿●▌         ▐•_•▌           ▐^‿^▌
  ▝▘ ▝▘        ▘▝ ▘▝
 idle          working         done
 blinks        walks, thinks   hops
```

## Install

```
/plugin install buddy --marketplace katipally/modz
```

## Use

- Idle: blinks every few seconds.
- While your turn runs: walks and thinks.
- When the turn ends: hops with a sparkle, then goes back to idle.
- Only the main agent's turns move it; subagents finishing do not.
- It only animates while something is happening, so an idle session does not redraw constantly.
