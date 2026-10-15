# modz

Every mod in this marketplace in one install: orchestrator, usage-limits, cache-timer, model-info and buddy. It has no code of its own, only dependencies on the others.

## Install

```
/plugin install modz --marketplace katipally/modz
```

The bundle installs each mod as its own plugin, so update them by name, then restart your sessions:

```
claude plugin marketplace update modz
claude plugin update orchestrator@modz
claude plugin update usage-limits@modz
claude plugin update cache-timer@modz
claude plugin update model-info@modz
claude plugin update buddy@modz
```

More in the [main README](../../../README.md#update).

Prefer a few? Install any mod on its own, see the table in the [main README](../../../README.md).
