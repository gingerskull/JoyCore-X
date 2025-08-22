# Latency Metrics Test Plan (Updated)

Status: Initial latency gating verification implemented; full statistical validation deferred.

Implemented:
1. Added always-present `test_min_duration_ms` field on `CommandSpec` (removed cfg(test) gating) allowing enforced minimum latency in tests without mock serial.
2. Created `test_drive_lines_with_min` helper to feed synthetic matcher lines and measure elapsed time.
3. Added `latency_metrics_with_min_durations` test asserting:
   - Command completion respects configured minimum latency (>= enforced ms).
   - Basic min/max spread across sample runs.

Deferred / Not Yet Implemented:
1. Deterministic multi-sample latency sequence asserting:
   - Running average equals arithmetic mean within epsilon.
   - EMA recurrence `ema_n = ema_{n-1} * 0.8 + sample * 0.2` for alpha=0.2.
2. Timeout scenario test verifying:
   - `command_timeouts` increments.
   - No update to last/min/max/avg/ema on timeout completion path.
3. Large spike influence test confirming max updates while average/EMA adjust per formula.
4. Mock serial interface capable of injecting scheduled delays between send and response for more realistic timing (currently skipped since min-duration gating covers gating logic).
5. Concurrency / overlap stress (out of scope while single in-flight is enforced by design).

Rationale for Partial Coverage:
- Primary priority shifted to command migration & cleanup; min-duration gating test provides baseline confidence that enforced delays integrate correctly without blocking matcher logic.
- Remaining tests add precision but are lower risk given straightforward arithmetic in metrics update path.

Next Steps (when revisited):
1. Add helper to step through a vector of (min_ms, simulated_latency_ms) applying direct latency injection (may extend helper to accept explicit elapsed override rather than sleep) and capture metrics snapshots after each command.
2. Implement timeout injection path (easiest via constructing a `CommandSpec` with very short timeout and providing no matching lines).
3. Assert EMA progression numerically across at least 5 distinct latency samples including a spike.
4. Document numeric example in this file for future maintainers.

Acceptance Criteria For Full Coverage (future):
- All metrics fields validated for: single sample, multi-sample sequence, timeout, spike.
- No warnings in test code and deterministic pass on CI within <50ms total added wall time.

Current Decision: Defer remaining work until after full protocol write-path migration & legacy removal.
