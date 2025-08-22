// Instead of mocking SerialPortIO trait (not exposed), we construct a UnifiedSerialBuilder with an empty SerialInterface clone and
// directly drive commands; responses are not actually read from hardware so matcher will never complete without injected lines.
// For latency metric testing we only need timing gating; we simulate completion by issuing a trivial matcher and allowing reader to see no lines.
// So we will skip this complex integration for now and just assert that enforced min durations delay completion using test_drive_lines helper.

// Adjust approach: Use test_drive_lines with artificial delay enforcement by manually constructing CommandSpec with min duration and feeding lines quickly.

#[test]
fn latency_metrics_with_min_durations() {
    use joycore_x_lib::serial::unified::reader::test_drive_lines_with_min;
    use joycore_x_lib::serial::unified::types::ResponseMatcher;
    let cases = vec![(50u64, ResponseMatcher::Contains("OK")), (120u64, ResponseMatcher::Contains("OK")), (30u64, ResponseMatcher::Contains("OK"))];
    let mut observed: Vec<u64> = Vec::new();
    for (min_ms, matcher) in cases.into_iter() {
        let (count, success, elapsed) = test_drive_lines_with_min(&["OK"], matcher, min_ms);
        assert_eq!(count, 1, "command did not complete");
        assert!(success, "response channel not fulfilled");
        assert!(elapsed >= min_ms, "elapsed {} < enforced {}", elapsed, min_ms);
        observed.push(elapsed);
    }
    let min = *observed.iter().min().unwrap();
    let max = *observed.iter().max().unwrap();
    assert!(min >= 30 && min <= 80);
    assert!(max >= 120);
    let avg: f64 = observed.iter().copied().map(|v| v as f64).sum::<f64>() / observed.len() as f64;
    assert!(avg >= 30.0);
}
