use joycore_x_lib::serial::unified::types::ResponseMatcher;
use joycore_x_lib::serial::unified::reader::test_drive_lines;

#[tokio::test]
async fn test_unified_list_files_matcher() {
    let lines = [
        "FILES:",
        "config.bin",
        "profile1.bin",
        "END_FILES"
    ];
    let matcher = ResponseMatcher::Contains("END_FILES");
    let (completed, success) = test_drive_lines(&lines, matcher);
    assert_eq!(completed, 1, "Matcher should complete when END_FILES encountered");
    assert!(success, "Should have completed successfully");
}