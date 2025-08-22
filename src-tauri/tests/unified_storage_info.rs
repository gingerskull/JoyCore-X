use joycore_x_lib::serial::unified::types::ResponseMatcher;
use joycore_x_lib::serial::unified::reader::test_drive_lines;

#[tokio::test]
async fn test_unified_storage_info_matcher() {
    let lines = [
        "STORAGE:USED=512,TOTAL=4096,FILES=2"
    ];
    let matcher = ResponseMatcher::Contains("STORAGE");
    let (completed, success) = test_drive_lines(&lines, matcher);
    assert_eq!(completed, 1, "Matcher should complete on STORAGE info line");
    assert!(success, "Should have captured storage info response");
}