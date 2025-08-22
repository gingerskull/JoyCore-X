use std::time::Duration;
use tokio::sync::{mpsc, broadcast, watch, oneshot};
use std::sync::Arc;
use joycore_x::serial::unified::{UnifiedSerialHandle, UnifiedSerialBuilder};
use joycore_x::serial::unified::types::*;
use joycore_x::serial::{SerialInterface};

// NOTE: We simulate interface by creating a loopback that immediately returns provided response lines spaced by sleeps.
// For deterministic timing we only rely on test_min_duration_ms gating; we emit all lines immediately.

struct DummyInterface {
    scripted: Vec<String>,
}

impl DummyInterface {
    fn new(scripted: Vec<&str>) -> Self { Self { scripted: scripted.into_iter().map(|s| format!("{}\n", s)).collect() } }
}

#[async_trait::async_trait]
impl joycore_x::serial::SerialPortIO for DummyInterface {
    async fn send_data(&mut self, _data: &[u8]) -> Result<(), joycore_x::serial::SerialError> { Ok(()) }
    async fn read_data(&mut self, buf: &mut [u8], _timeout_ms: u64) -> Result<usize, joycore_x::serial::SerialError> {
        if self.scripted.is_empty() { return Err(joycore_x::serial::SerialError::Timeout); }
        let next = self.scripted.remove(0);
        let bytes = next.as_bytes();
        let n = bytes.len().min(buf.len());
        buf[..n].copy_from_slice(&bytes[..n]);
        Ok(n)
    }
    async fn flush(&mut self) -> Result<(), joycore_x::serial::SerialError> { Ok(()) }
}

// Provide a helper to build a unified reader around our dummy interface
async fn build_dummy_unified(scripted: Vec<&str>) -> UnifiedSerialHandle {
    let underlying = SerialInterface::from_io(Box::new(DummyInterface::new(scripted)));
    UnifiedSerialBuilder::new(underlying).build()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn latency_metrics_with_min_durations() {
    // We'll fire three commands with enforced min durations 50ms, 120ms, 30ms.
    let handle = build_dummy_unified(vec!["OK", "OK", "OK"]).await; // responses for three commands

    let specs = vec![
        ("CMD1", 50u64),
        ("CMD2", 120u64),
        ("CMD3", 30u64),
    ];

    for (name, wait) in &specs {
        let spec = CommandSpec {
            name: name,
            timeout: Duration::from_millis(wait + 200),
            matcher: ResponseMatcher::Contains("OK"),
            #[cfg(test)]
            test_min_duration_ms: Some(*wait),
        };
        let start = std::time::Instant::now();
        let _resp = handle.send_command(name.to_string(), spec).await.expect("command");
        let elapsed = start.elapsed().as_millis() as u64;
        assert!(elapsed >= *wait, "Elapsed {elapsed} < enforced {wait}");
    }

    // Pull metrics and assert latency stats
    let metrics = handle.metrics_receiver().borrow().clone();
    assert_eq!(metrics.command_completed, 3);
    let min = metrics.command_min_latency_ms.unwrap();
    let max = metrics.command_max_latency_ms.unwrap();
    assert!(min >= 30 && min <= 60, "min latency unexpected: {min}");
    assert!(max >= 120, "max latency unexpected: {max}");
    assert_eq!(metrics.command_latency_samples, 3);
    let avg = metrics.command_avg_latency_ms.unwrap();
    assert!(avg >= 30.0);
    assert!(metrics.command_ema_latency_ms.is_some());
}
