# cache-timer

Prompt cache hit rate for the main agent's last request, and how long until the cache goes cold.

```
cache 98% · 54m
```

## Install

```
/plugin install cache-timer --marketplace katipally/modz
```

- The time is green while the cache is warm and counts down from the last request; it turns red (`2m ago`) once the cache has gone cold.
- The percentage turns yellow under 90% and red under 70%.
- Claude Code does not report the cache lifetime: set it with `/cache-ttl 5m` or `/cache-ttl 1h` (default 1h, remembered).
- Subagent requests are ignored.
