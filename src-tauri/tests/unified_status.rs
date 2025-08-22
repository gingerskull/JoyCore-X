use joycore_x_lib::serial::unified::reader::test_drive_lines;
use joycore_x_lib::serial::unified::types::ResponseMatcher;

#[test]
fn test_status_command_completion() {
    // Simulate lines a STATUS command might produce before final OK line
    let lines = [
        "STATUS:DEVICE:JoyCore HOTAS",
        "STATUS:FIRMWARE:1.0.0",
        "OK:STATUS_DONE"
    ];
    let (completed, success) = test_drive_lines(&lines, ResponseMatcher::UntilPrefix("OK:"));
    assert_eq!(completed, 1, "expected one command completion");
    assert!(success, "expected oneshot responder success");
}
