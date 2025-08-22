pub mod types;
pub mod reader;

pub use reader::{UnifiedSerialBuilder, UnifiedSerialHandle};
pub use types::{ParsedEvent, RawStateSnapshot, CommandSpec, ResponseMatcher, SerialCommand};
