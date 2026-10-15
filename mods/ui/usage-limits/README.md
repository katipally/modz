# usage-limits

Context bar plus your 5-hour and weekly rate limits, each with time left until it resets. Shown above the prompt; updates after every turn and ticks every 30s.

```
ctx   ████░░░░░░ 41%   5h 42% · 27m   7d 6% · 6d 18h
```

## Install

```
/plugin install usage-limits --marketplace katipally/modz
```

Update, then restart your sessions (more in the [main README](../../../README.md#update)):

```
claude plugin marketplace update modz
claude plugin update usage-limits@modz
```

Percentages turn yellow at 60% and red at 85%: the context bar is orange below that, the 5h and 7d values green. Labels and reset times stay uncolored; the time after each limit is how long until it resets. Rate limits show on subscription accounts only. Before the first numbers arrive (and for limits your account does not report) the tile draws `ctx ░░░░░░░░░░ –   5h –   7d –` instead of hiding.
