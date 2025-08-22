use joycore_x_lib::serial::unified::types::ResponseMatcher;
use joycore_x_lib::serial::unified::reader::test_drive_lines;

// This test validates the ResponseMatcher logic for BUTTON_GET using the UntilPrefix matcher.
// We simulate lines arriving including a monitor line to ensure non-command lines are ignored.
#[tokio::test]
async fn test_unified_button_get_matcher() {
    // Simulated response line from firmware
    let lines = [
        "GPIO_STATES:0xFFFF:1234", // monitor line should be ignored
        "BUTTON:1,Fire,TRIGGER,true"
    ];
    let matcher = ResponseMatcher::UntilPrefix("BUTTON:".into());
    let (completed, success) = test_drive_lines(&lines, matcher);
    assert_eq!(completed, 1, "Matcher should complete after BUTTON line");
    assert!(success, "Should have successfully received response");
}

// Basic parsing logic duplication: ensure we can parse the button config line similarly to protocol implementation.
#[test]
fn test_button_line_parsing() {
    let response = "BUTTON:2,Jump,ACTION,false";
    let config_str = response.strip_prefix("BUTTON:").expect("prefix");
    let parts: Vec<&str> = config_str.split(',').collect();
    assert_eq!(parts.len(), 4);
    assert_eq!(parts[0], "2");
    assert_eq!(parts[1], "Jump");
    assert_eq!(parts[2], "ACTION");
    assert_eq!(parts[3], "false");
}