# cache-timer

Prompt cache hit rate for the main agent's last request, and whether the cache is still warm with a countdown until it expires.

```
cache 98% hit 406k read / 4k new · ● warm 54m 10s left · ttl 1h
```

## Install

```
/plugin install cache-timer --marketplace katipally/modz
```

- `● warm` counts down from the last request; after that it shows `○ cold for …`.
- Claude Code does not report the cache lifetime, so click `ttl` to switch between 5m and 1h. The choice is remembered.
- Subagent requests are ignored.
