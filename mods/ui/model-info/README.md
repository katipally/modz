# model-info

Pick the model and slide thinking effort, right above the prompt.

```
Opus 5.5 ▾   effort ■ ■ ■ □ □ high
```

## Install

```
/plugin install model-info --marketplace katipally/modz
```

## Use

- The model name is a dropdown (Opus, Sonnet, Haiku). Picking one runs Claude Code's own `/model`.
- The five squares are an effort slider: low, medium, high, xhigh, max. Clicking one runs `/effort`. Filled squares show the current level.
- If a model does not support a level, `/effort` says so in a toast.
- Shows the main agent only; subagents are ignored.
