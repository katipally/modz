# model-info

Pick the model and thinking effort, right above the prompt.

```
Opus 5.5 ▾   high ▾
```

## Install

```
/plugin install model-info --marketplace katipally/modz
```

## Use

- The model dropdown lists exactly what `/config`'s Model row offers your account. Picking one runs Claude Code's own `/model`.
- The effort dropdown lists the levels `/effort` offers for the current model, and refreshes after a model switch. Picking one runs `/effort`.
- If a model does not support a level, `/effort` says so in a toast.
- Shows the main agent only; subagents are ignored.
- In the terminal each dropdown is a button that opens a row of options you can click (a terminal Select only answers the keyboard).
