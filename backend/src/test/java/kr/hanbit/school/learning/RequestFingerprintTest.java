package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RequestFingerprintTest {
  private final RequestFingerprint fingerprints = new RequestFingerprint();
  private final UUID requestId = UUID.fromString("00000000-0000-0000-0000-000000000001");

  @Test
  void startFingerprintIncludesTheTypedPayloadOperationMethodAndCanonicalPath() {
    // Independently hashed UTF-8 contract fields with shasum -a 256, no trailing LF:
    // operation=START_SESSION, method=POST, path=/api/student/learning/sessions,
    // mode=enum:FIRST, dayNumber=int:1, questionIds=[], requestId=uuid:<requestId>.
    assertThat(fingerprints.start(
        new StartLearningSessionCommand(LearningMode.FIRST, 1, List.of(), requestId)))
        .isEqualTo("4d363bc5e1f82052546fc9f08393f2a179b8186a49587045396bbd2dd702e38b");
  }

  @Test
  void absentAndEmptyQuestionListsHaveTheSameStartMeaning() {
    assertThat(fingerprints.start(
        new StartLearningSessionCommand(LearningMode.FIRST, 1, null, requestId)))
        .isEqualTo(fingerprints.start(
            new StartLearningSessionCommand(LearningMode.FIRST, 1, List.of(), requestId)));
  }

  @Test
  void changingAnyTypedPayloadFieldOrReviewOrderChangesTheFingerprint() {
    var commands = List.of(
        new StartLearningSessionCommand(LearningMode.FIRST, 1, List.of(), requestId),
        new StartLearningSessionCommand(LearningMode.FIRST, 2, List.of(), requestId),
        new StartLearningSessionCommand(LearningMode.REPLAY, 1, List.of(), requestId),
        new StartLearningSessionCommand(LearningMode.FIRST, 1, List.of(),
            UUID.fromString("00000000-0000-0000-0000-000000000002")),
        new StartLearningSessionCommand(LearningMode.REVIEW, null, List.of(1, 2), requestId),
        new StartLearningSessionCommand(LearningMode.REVIEW, null, List.of(2, 1), requestId));
    assertThat(commands.stream().map(fingerprints::start).toList()).doesNotHaveDuplicates();
  }
}
