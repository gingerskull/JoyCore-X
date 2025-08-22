//! Unified serial communication core types (scaffolding phase 1)
use std::time::Duration;
use serde::{Serialize, Deserialize};
use crate::serial::SerialError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawStateSnapshot {
    pub gpio_mask: u32,
    pub matrix: Vec<MatrixCell>,
    pub shift_regs: Vec<ShiftRegEntry>,
    pub last_update_us: u64,
    pub seq: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixCell { pub row: u8, pub col: u8, pub is_connected: bool }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShiftRegEntry { pub register_id: u8, pub value: u8, pub timestamp: u64 }

impl Default for RawStateSnapshot { fn default() -> Self { Self { gpio_mask:0, matrix:Vec::new(), shift_regs:Vec::new(), last_update_us:0, seq:0 } } }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ParsedEvent {
    Gpio { mask: u32, timestamp: u64 },
    MatrixDelta { row: u8, col: u8, is_connected: bool, timestamp: u64 },
    Shift { register_id: u8, value: u8, timestamp: u64 },
    ProtocolNotice { message: String },
    Unclassified { line: String },
}

// Command response container
#[derive(Debug, Clone)]
pub struct CommandResponse { pub lines: Vec<String>, pub finished_reason: FinishReason }

#[derive(Debug, Clone)]
pub enum FinishReason { MatcherSatisfied, Timeout, Error(String) }

// Generic matcher (simplified scaffold)
#[derive(Debug, Clone)]
pub enum ResponseMatcher {
    UntilPrefix(&'static str),
    FixedLines(usize),
    Contains(&'static str),
    Custom(fn(&[String]) -> bool),
}

impl ResponseMatcher {
    pub fn is_complete(&self, lines: &[String]) -> bool {
        match self {
            ResponseMatcher::UntilPrefix(p) => lines.iter().any(|l| l.starts_with(p)),
            ResponseMatcher::FixedLines(n) => lines.len() >= *n,
            ResponseMatcher::Contains(s) => lines.iter().any(|l| l.contains(s)),
            ResponseMatcher::Custom(f) => f(lines),
        }
    }
}

// Command specification (phase 1 minimal; will gain parser + version gating later)
#[derive(Debug, Clone)]
pub struct CommandSpec {
    pub name: &'static str,
    pub timeout: Duration,
    pub matcher: ResponseMatcher,
    pub test_min_duration_ms: Option<u64>,
}

pub struct PendingCommand {
    pub spec: CommandSpec,
    pub started: std::time::Instant,
    pub responder: tokio::sync::oneshot::Sender<Result<CommandResponse, SerialError>>,
    pub buffer: Vec<String>,
}

#[derive(Debug)]
pub enum SerialCommand {
    Write { cmd: String, spec: CommandSpec, responder: tokio::sync::oneshot::Sender<Result<CommandResponse, SerialError>> },
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetricsSnapshot {
    pub lines_read: u64,
    pub monitor_events: u64,
    pub command_completed: u64,
    pub command_timeouts: u64,
    pub last_error: Option<String>,
    // New metrics
    pub command_last_latency_ms: Option<u64>,
    pub command_min_latency_ms: Option<u64>,
    pub command_max_latency_ms: Option<u64>,
    pub command_avg_latency_ms: Option<f64>,
    pub command_ema_latency_ms: Option<f64>,
    pub command_latency_samples: u64,
    pub partial_buffer_trims: u64,
    pub unclassified_lines: u64,
    pub utf8_decode_errors: u64,
}
