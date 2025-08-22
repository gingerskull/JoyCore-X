//! Unified serial reader task (scaffold - not yet wired into DeviceManager)
use std::sync::Arc;
use tokio::sync::{mpsc, broadcast, watch};
use crate::serial::{SerialInterface, SerialError};
use tokio::sync::Mutex;
use super::types::*;
use std::time::Duration;

#[derive(Clone)]
pub struct UnifiedSerialHandle {
    pub cmd_tx: mpsc::Sender<SerialCommand>,
    pub events_tx: broadcast::Sender<ParsedEvent>,
    pub snapshot_rx: watch::Receiver<Arc<RawStateSnapshot>>,
    pub metrics_rx: watch::Receiver<MetricsSnapshot>,
}

impl UnifiedSerialHandle {
    pub fn subscribe_events(&self) -> broadcast::Receiver<ParsedEvent> { self.events_tx.subscribe() }
    pub fn snapshot_receiver(&self) -> watch::Receiver<Arc<RawStateSnapshot>> { self.snapshot_rx.clone() }
    pub fn metrics_receiver(&self) -> watch::Receiver<MetricsSnapshot> { self.metrics_rx.clone() }
    pub async fn send_command(&self, cmd: String, spec: CommandSpec) -> Result<CommandResponse, SerialError> {
        use tokio::sync::oneshot;
        let (tx, rx) = oneshot::channel();
        self.cmd_tx.send(SerialCommand::Write { cmd, spec, responder: tx }).await.map_err(|_| SerialError::ProtocolError("Command channel closed".into()))?;
        rx.await.map_err(|_| SerialError::ProtocolError("Response dropped".into()))?
    }
}

pub struct UnifiedSerialBuilder {
    pub interface: Arc<Mutex<SerialInterface>>,
    pub event_capacity: usize,
    pub command_capacity: usize,
}

impl UnifiedSerialBuilder {
    pub fn new(interface: SerialInterface) -> Self { Self { interface: Arc::new(Mutex::new(interface)), event_capacity: 256, command_capacity: 64 } }
    pub fn build(self) -> UnifiedSerialHandle {
        let (cmd_tx, cmd_rx) = mpsc::channel(self.command_capacity);
        let (events_tx, _events_rx) = broadcast::channel(self.event_capacity);
    let (snapshot_tx, snapshot_rx) = watch::channel(Arc::new(RawStateSnapshot::default()));
    let (metrics_tx, metrics_rx) = watch::channel(MetricsSnapshot::default());

    tokio::spawn(reader_task(self.interface.clone(), cmd_rx, events_tx.clone(), snapshot_tx, metrics_tx));

    UnifiedSerialHandle { cmd_tx, events_tx, snapshot_rx, metrics_rx }
    }
}

pub(crate) async fn reader_task(
    interface: Arc<Mutex<SerialInterface>>,
    mut cmd_rx: mpsc::Receiver<SerialCommand>,
    events_tx: broadcast::Sender<ParsedEvent>,
    snapshot_tx: watch::Sender<Arc<RawStateSnapshot>>,
    metrics_tx: watch::Sender<MetricsSnapshot>,
) {
    use tokio::select;
    use tokio::time::sleep;

    let mut partial = String::new();
    let mut pending: Option<PendingCommand> = None;
    let mut snapshot = Arc::new(RawStateSnapshot::default());
    let monitor_prefixes = ["GPIO_STATES:", "MATRIX_STATE:", "SHIFT_REG:"];
    let mut metrics = MetricsSnapshot::default();

    loop {
        select! {
            maybe_cmd = cmd_rx.recv() => {
                match maybe_cmd {
                    Some(SerialCommand::Write { cmd, spec, responder }) => {
                        if pending.is_some() { let _ = responder.send(Err(SerialError::ProtocolError("Another command in flight".into()))); continue; }
                        let write_line = format!("{}\n", cmd);
                        if let Err(e) = { let mut guard = interface.lock().await; guard.send_data(write_line.as_bytes()).await } { let _ = responder.send(Err(e)); continue; }
                        pending = Some(PendingCommand { spec, started: std::time::Instant::now(), responder, buffer: Vec::new() });
                    },
                    Some(SerialCommand::Shutdown) => { break; },
                    None => break,
                }
            },
            read_res = async {
                let mut buf = [0u8; 512];
                let res = { let mut guard = interface.lock().await; guard.read_data(&mut buf, 25).await.map(|n| (buf, n)) };
                res
            } => {
                match read_res {
                    Ok((buf, n)) if n > 0 => {
                        let chunk_result = std::str::from_utf8(&buf[..n]);
                        let chunk = match chunk_result { Ok(s) => s.to_string(), Err(_) => { metrics.utf8_decode_errors +=1; String::from_utf8_lossy(&buf[..n]).to_string() } }; 
                        partial.push_str(&chunk);
                        let mut idx = 0;
                        while let Some(pos) = partial[idx..].find(['\n','\r']) {
                            let abs = idx + pos; let line = partial[..abs].to_string();
                            if !line.trim().is_empty() { metrics.lines_read +=1; let before = metrics.monitor_events; let before_unclassified = metrics.unclassified_lines; process_line(&line, &events_tx, &mut snapshot, &snapshot_tx, pending.as_mut(), &monitor_prefixes, &mut metrics); if metrics.monitor_events != before || metrics.unclassified_lines != before_unclassified { let _ = metrics_tx.send(metrics.clone()); }
                if let Some(p) = pending.as_mut() { if !monitor_prefixes.iter().any(|pre| line.starts_with(pre)) { p.buffer.push(line.clone()); if p.spec.matcher.is_complete(&p.buffer) {
                    // Enforce optional minimum duration before allowing completion (used by tests for latency metrics)
                    if let Some(min_ms) = p.spec.test_min_duration_ms { if p.started.elapsed().as_millis() < min_ms as u128 { continue; } }
                    let p_done = pending.take().unwrap(); let latency_ms = p_done.started.elapsed().as_millis() as u64; metrics.command_completed +=1; metrics.command_last_latency_ms = Some(latency_ms); metrics.command_min_latency_ms = Some(match metrics.command_min_latency_ms { Some(m) => m.min(latency_ms), None => latency_ms }); metrics.command_max_latency_ms = Some(match metrics.command_max_latency_ms { Some(m) => m.max(latency_ms), None => latency_ms }); metrics.command_latency_samples +=1; // update avg
                    metrics.command_avg_latency_ms = Some(match (metrics.command_avg_latency_ms, metrics.command_latency_samples) { (Some(avg), samples) if samples>1 => ((avg * (samples as f64 -1.0)) + latency_ms as f64) / samples as f64, _ => latency_ms as f64 });
                    metrics.command_ema_latency_ms = Some(match metrics.command_ema_latency_ms { Some(prev) => (prev * 0.8) + (latency_ms as f64 * 0.2), None => latency_ms as f64 });
                    let _ = metrics_tx.send(metrics.clone()); let resp = CommandResponse { lines: p_done.buffer, finished_reason: FinishReason::MatcherSatisfied }; let _ = p_done.responder.send(Ok(resp)); } } }
                            }
                            let mut advance = abs + 1; while advance < partial.len() && (partial.as_bytes()[advance]==b'\n' || partial.as_bytes()[advance]==b'\r') { advance+=1; }
                            partial.drain(..advance); idx = 0;
                        }
                        if partial.len() > 8192 { partial = partial[partial.len()-4096..].to_string(); metrics.partial_buffer_trims +=1; let _ = metrics_tx.send(metrics.clone()); }
                    },
                    Ok(_) => {},
                    Err(SerialError::Timeout) => {},
                    Err(e) => { let msg = format!("IO error: {}", e); let _ = events_tx.send(ParsedEvent::ProtocolNotice { message: msg.clone() }); metrics.last_error = Some(msg.clone()); let _ = metrics_tx.send(metrics.clone()); if let Some(p) = pending.take() { let _ = p.responder.send(Err(e)); } break; }
                }
            },
            _ = sleep(Duration::from_millis(5)) => { if let Some(p) = pending.as_mut() { if p.started.elapsed() > p.spec.timeout { let p_done = pending.take().unwrap(); metrics.command_timeouts +=1; let _ = metrics_tx.send(metrics.clone());
                // Diagnostic log with partial buffer for troubleshooting timeouts
                if !p_done.buffer.is_empty() { log::warn!("Command '{}' timeout after {:?}; partial lines: {:?}", p_done.spec.name, p_done.spec.timeout, p_done.buffer); } else { log::warn!("Command '{}' timeout after {:?}; no lines received", p_done.spec.name, p_done.spec.timeout); }
                let _ = p_done.responder.send(Err(SerialError::Timeout)); } } }
        }
    }
    if let Some(p) = pending.take() { let _ = p.responder.send(Err(SerialError::ProtocolError("Reader terminated".into()))); }
}


fn process_line(
    line: &str,
    events_tx: &broadcast::Sender<ParsedEvent>,
    snapshot: &mut Arc<RawStateSnapshot>,
    snapshot_tx: &watch::Sender<Arc<RawStateSnapshot>>,
    _pending: Option<&mut PendingCommand>,
    monitor_prefixes: &[&str],
    metrics: &mut MetricsSnapshot,
) {
    // Only classify monitor lines
    if monitor_prefixes.iter().any(|pre| line.starts_with(pre)) {
        if let Some(evt) = parse_monitor_line(line) {
            // Update snapshot if state event
            let mut updated = (**snapshot).clone();
            let mut changed = false;
            match &evt {
                ParsedEvent::Gpio { mask, timestamp } => { updated.gpio_mask = *mask; updated.last_update_us = *timestamp; updated.seq +=1; changed = true; },
                ParsedEvent::MatrixDelta { row, col, is_connected, timestamp } => {
                    // replace or insert
                    if let Some(cell) = updated.matrix.iter_mut().find(|c| c.row==*row && c.col==*col) { cell.is_connected = *is_connected; } else { updated.matrix.push(super::types::MatrixCell { row:*row, col:*col, is_connected:*is_connected }); }
                    updated.last_update_us = *timestamp; updated.seq +=1; changed = true;
                },
                ParsedEvent::Shift { register_id, value, timestamp } => {
                    if let Some(reg) = updated.shift_regs.iter_mut().find(|r| r.register_id==*register_id) { reg.value = *value; reg.timestamp = *timestamp; } else { updated.shift_regs.push(super::types::ShiftRegEntry { register_id:*register_id, value:*value, timestamp:*timestamp }); }
                    updated.last_update_us = *timestamp; updated.seq +=1; changed = true;
                },
                _ => {}
            }
            let _ = events_tx.send(evt);
            metrics.monitor_events +=1;
            if changed { let new_arc = Arc::new(updated); *snapshot = new_arc.clone(); let _ = snapshot_tx.send(new_arc); }
        } else {
            metrics.unclassified_lines +=1;
            let _ = events_tx.send(ParsedEvent::Unclassified { line: line.to_string() });
        }
    } else {
        // Non monitor line: maybe command response, ignore here but count as unclassified context if not part of command buffer.
        metrics.unclassified_lines +=1;
    }
}

pub fn parse_monitor_line(line: &str) -> Option<ParsedEvent> {
    if let Some(rest) = line.strip_prefix("GPIO_STATES:") {
        let parts: Vec<&str> = rest.split(':').collect();
        if parts.len() == 2 { if let (Ok(mask), Ok(ts)) = (u32::from_str_radix(parts[0].trim_start_matches("0x"),16), parts[1].parse::<u64>()) { return Some(ParsedEvent::Gpio { mask, timestamp: ts }); } }
        return None;
    }
    if let Some(rest) = line.strip_prefix("MATRIX_STATE:") {
        let parts: Vec<&str> = rest.split(':').collect();
        if parts.len() == 4 { if let (Ok(row), Ok(col), Ok(state), Ok(ts)) = (parts[0].parse::<u8>(), parts[1].parse::<u8>(), parts[2].parse::<u8>(), parts[3].parse::<u64>()) { return Some(ParsedEvent::MatrixDelta { row, col, is_connected: state==1, timestamp: ts }); } }
        return None;
    }
    if let Some(rest) = line.strip_prefix("SHIFT_REG:") {
        let parts: Vec<&str> = rest.split(':').collect();
        if parts.len() == 3 { if let (Ok(reg), Ok(val), Ok(ts)) = (parts[0].parse::<u8>(), u8::from_str_radix(parts[1].trim_start_matches("0x"),16), parts[2].parse::<u64>()) { return Some(ParsedEvent::Shift { register_id: reg, value: val, timestamp: ts }); } }
        return None;
    }
    None
}

// Test helper exposed unconditionally
pub fn test_drive_lines(lines: &[&str], matcher: super::types::ResponseMatcher) -> (usize, bool) {
    use super::types::{PendingCommand, CommandSpec, CommandResponse, FinishReason};
    use std::time::{Instant, Duration};
    use tokio::sync::oneshot;
    let (tx, mut rx) = oneshot::channel();
    let spec = CommandSpec { name: "TEST", timeout: Duration::from_millis(100), matcher, test_min_duration_ms: None };
    let mut pending = Some(PendingCommand { spec: spec.clone(), started: Instant::now(), responder: tx, buffer: Vec::new() });
    let mut metrics = MetricsSnapshot::default();
    let monitor_prefixes = ["GPIO_STATES:", "MATRIX_STATE:", "SHIFT_REG:"];
    // Dummy channels for snapshot/events
    let (events_tx, _events_rx) = broadcast::channel(16);
    let (snapshot_tx, snapshot_rx) = watch::channel(Arc::new(RawStateSnapshot::default()));
    let mut snapshot = snapshot_rx.borrow().clone();
    let mut deferred_completion = false;
    for line in lines {
        // Only treat as command response if not monitor
        if !monitor_prefixes.iter().any(|pre| line.starts_with(pre)) {
            if let Some(p) = pending.as_mut() { p.buffer.push((*line).to_string()); if p.spec.matcher.is_complete(&p.buffer) {
                if let Some(min_ms) = p.spec.test_min_duration_ms { if p.started.elapsed().as_millis() < min_ms as u128 { deferred_completion = true; continue; } }
                let p_done = pending.take().unwrap(); let resp = CommandResponse { lines: p_done.buffer, finished_reason: FinishReason::MatcherSatisfied }; metrics.command_completed +=1; let _ = p_done.responder.send(Ok(resp)); break; } }
        } else {
            process_line(line, &events_tx, &mut snapshot, &snapshot_tx, pending.as_mut(), &monitor_prefixes, &mut metrics);
        }
    }
    // If completion was deferred due to min duration, wait until satisfied
    if deferred_completion {
        if let Some(p) = pending.take() {
            if let Some(min_ms) = p.spec.test_min_duration_ms { while p.started.elapsed().as_millis() < min_ms as u128 { std::thread::sleep(std::time::Duration::from_millis(1)); }
                let resp = CommandResponse { lines: p.buffer, finished_reason: FinishReason::MatcherSatisfied }; metrics.command_completed +=1; let _ = p.responder.send(Ok(resp)); }
        }
    }
    let completed = metrics.command_completed;
    let success = completed > 0 && rx.try_recv().is_ok();
    (completed as usize, success)
}

// Test helper with minimum duration
pub fn test_drive_lines_with_min(lines: &[&str], matcher: super::types::ResponseMatcher, min_ms: u64) -> (usize, bool, u64) {
    use super::types::{PendingCommand, CommandSpec, CommandResponse, FinishReason, MetricsSnapshot};
    use std::time::{Instant, Duration};
    use tokio::sync::oneshot;
    let (tx, mut rx) = oneshot::channel();
    let spec = CommandSpec { name: "TEST", timeout: Duration::from_millis(min_ms+100), matcher, test_min_duration_ms: Some(min_ms) };
    let start = Instant::now();
    let mut pending = Some(PendingCommand { spec: spec.clone(), started: start, responder: tx, buffer: Vec::new() });
    let mut metrics = MetricsSnapshot::default();
    let monitor_prefixes = ["GPIO_STATES:", "MATRIX_STATE:", "SHIFT_REG:"];
    let (events_tx, _events_rx) = broadcast::channel(16);
    let (snapshot_tx, snapshot_rx) = watch::channel(Arc::new(RawStateSnapshot::default()));
    let mut snapshot = snapshot_rx.borrow().clone();
    let mut deferred = false;
    for line in lines {
        if !monitor_prefixes.iter().any(|pre| line.starts_with(pre)) {
            if let Some(p) = pending.as_mut() { p.buffer.push((*line).to_string()); if p.spec.matcher.is_complete(&p.buffer) { if p.started.elapsed().as_millis() < min_ms as u128 { deferred = true; continue; } let p_done = pending.take().unwrap(); let resp = CommandResponse { lines: p_done.buffer, finished_reason: FinishReason::MatcherSatisfied }; metrics.command_completed +=1; let _ = p_done.responder.send(Ok(resp)); break; } }
        } else { process_line(line, &events_tx, &mut snapshot, &snapshot_tx, pending.as_mut(), &monitor_prefixes, &mut metrics); }
    }
    if deferred { if let Some(p) = pending.take() { while p.started.elapsed().as_millis() < min_ms as u128 { std::thread::sleep(Duration::from_millis(1)); } let elapsed = p.started.elapsed().as_millis() as u64; let resp = CommandResponse { lines: p.buffer, finished_reason: FinishReason::MatcherSatisfied }; metrics.command_completed +=1; let _ = p.responder.send(Ok(resp)); return (metrics.command_completed as usize, rx.try_recv().is_ok(), elapsed); } }
    let elapsed = start.elapsed().as_millis() as u64;
    (metrics.command_completed as usize, rx.try_recv().is_ok(), elapsed)
}
