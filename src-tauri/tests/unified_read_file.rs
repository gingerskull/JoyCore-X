use joycore_x_lib::serial::unified::types::ResponseMatcher;
use joycore_x_lib::serial::unified::reader::test_drive_lines;

#[tokio::test]
async fn test_unified_read_file_matcher() {
    // Simulated lines: a non-matching informational line followed by a FILE_DATA response that should complete the matcher
    let lines = [
        "Some unrelated notice",
        "FILE_DATA:/config.bin:04:DEADBEEF"
    ];
    let matcher = ResponseMatcher::UntilPrefix("FILE_DATA:");
    let (completed, success) = test_drive_lines(&lines, matcher);
    assert_eq!(completed, 1, "Matcher should complete on FILE_DATA line");
    assert!(success, "Response should be delivered");
}