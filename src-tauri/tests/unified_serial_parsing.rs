use joycore_x_lib::serial::unified::reader::parse_monitor_line;
use joycore_x_lib::serial::unified::types::{ParsedEvent, ResponseMatcher};

#[test]
fn test_parse_gpio_line() {
    let line = "GPIO_STATES:0x0F:123456";
    let evt = parse_monitor_line(line).expect("should parse GPIO");
    match evt { ParsedEvent::Gpio { mask, timestamp } => { assert_eq!(mask, 0x0F); assert_eq!(timestamp, 123456); }, _ => panic!("wrong variant") }
}

#[test]
fn test_parse_matrix_line() {
    let line = "MATRIX_STATE:2:5:1:987654";
    let evt = parse_monitor_line(line).expect("should parse MATRIX");
    match evt { ParsedEvent::MatrixDelta { row, col, is_connected, timestamp } => { assert_eq!(row,2); assert_eq!(col,5); assert!(is_connected); assert_eq!(timestamp,987654); }, _ => panic!("wrong variant") }
}

#[test]
fn test_parse_shift_line() {
    let line = "SHIFT_REG:3:0xAA:555";
    let evt = parse_monitor_line(line).expect("should parse SHIFT");
    match evt { ParsedEvent::Shift { register_id, value, timestamp } => { assert_eq!(register_id,3); assert_eq!(value,0xAA); assert_eq!(timestamp,555); }, _ => panic!("wrong variant") }
}

#[test]
fn test_response_matchers() {
    let lines = vec!["HELLO".to_string(), "WORLD".to_string(), "OK:DONE".to_string()];
    assert!(ResponseMatcher::UntilPrefix("OK:").is_complete(&lines));
    assert!(ResponseMatcher::FixedLines(3).is_complete(&lines));
    assert!(ResponseMatcher::Contains("WORLD").is_complete(&lines));
    let custom = ResponseMatcher::Custom(|ls| ls.len()==3 && ls[2].starts_with("OK:"));
    assert!(custom.is_complete(&lines));
}
