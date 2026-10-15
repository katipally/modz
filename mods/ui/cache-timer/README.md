# cache-timer

Prompt cache hit rate for the main agent's last request, and how long until the cache goes cold.

```
cache 98% · 54m
```

## Install

```
/plugin install cache-timer --marketplace katipally/modz
```

Update, then restart your sessions (more in the [main README](../../../README.md#update)):

```
claude plugin marketplace update modz
claude plugin update cache-timer@modz
```

- The time is green while the cache is warm and counts down from the last request; it turns red (`2m ago`) once the cache has gone cold.
- The percentage turns yellow under 90% and red under 70%.
- Claude Code does not report the cache lifetime: set it with `/cache-ttl 5m` or `/cache-ttl 1h` (default 1h, remembered).
- Subagent requests are ignored.
- Until the first request of a new session the tile reads `cache – · –`: Claude Code has no cache figures before a request is made. When you resume a session the countdown starts at once from the time since the last response, and the hit rate too if Claude Code has that response's token counts, otherwise it shows `–` until the next request.
