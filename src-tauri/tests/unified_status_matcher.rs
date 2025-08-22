use joycore_x_lib::serial::unified::types::ResponseMatcher;
use joycore_x_lib::serial::unified::reader::test_drive_lines;

#[tokio::test]
async fn test_unified_status_matcher() {
    let lines = [
        "STATUS:OK:FIRMWARE=1.2.3"
    ];
    let matcher = ResponseMatcher::Contains("STATUS");
    let (completed, success) = test_drive_lines(&lines, matcher);
    assert_eq!(completed, 1, "Matcher should complete on STATUS line");
    assert!(success, "Should have captured status response");
}