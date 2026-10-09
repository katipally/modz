# cache-timer

Prompt cache hit rate for the main agent's last request, and whether the cache is still warm with a countdown until it expires.

```
cache 98% hit · 406k read · 4k new   ● 54m left
```

## Install

```
/plugin install cache-timer --marketplace katipally/modz
```

- Green `● 54m left` counts down from the last request; red `○ 2m ago` once the cache has gone cold.
- Claude Code does not report the cache lifetime: set it with `/cache-ttl 5m` or `/cache-ttl 1h` (default 1h, remembered).
- Subagent requests are ignored.
