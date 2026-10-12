package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import kr.hanbit.school.content.AnswerChoice;
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

  @Test
  void answerFingerprintIncludesTheTypedPayloadAndCanonicalSessionPath() {
    // Independent Python hashlib SHA-256 of the UTF-8 fields, without a trailing LF.
    var sessionId = UUID.fromString("00000000-0000-0000-0000-000000000002");
    assertThat(
            fingerprints.answer(sessionId, new SubmitAnswerCommand(requestId, 1, AnswerChoice.O)))
        .isEqualTo("5430d184ab7c4a70f060df5673d8c3306612ed2f081e38e12ebeccd80de4068f");
  }

  @Test
  void advanceFingerprintIncludesTheCanonicalSessionPathAndRequestId() {
    var sessionId = UUID.fromString("00000000-0000-0000-0000-000000000002");
    assertThat(fingerprints.advance(sessionId, new AdvanceLearningSessionCommand(requestId)))
        .isEqualTo("3b729e5e63697f2865186cc2a9051938b3bc4c34055b313346a5834cfdf9aa84");
  }

  @Test
  void changingSessionQuestionChoiceOrRequestIdChangesAnswerAndAdvanceFingerprints() {
    var sessionId = UUID.fromString("00000000-0000-0000-0000-000000000002");
    var otherSession = UUID.fromString("00000000-0000-0000-0000-000000000003");
    var otherRequest = UUID.fromString("00000000-0000-0000-0000-000000000004");
    var command = new SubmitAnswerCommand(requestId, 1, AnswerChoice.O);
    assertThat(
            List.of(
                fingerprints.answer(sessionId, command),
                fingerprints.answer(otherSession, command),
                fingerprints.answer(
                    sessionId, new SubmitAnswerCommand(requestId, 2, AnswerChoice.O)),
                fingerprints.answer(
                    sessionId, new SubmitAnswerCommand(requestId, 1, AnswerChoice.X)),
                fingerprints.answer(sessionId, new SubmitAnswerCommand(requestId, 1, null)),
                fingerprints.answer(
                    sessionId, new SubmitAnswerCommand(otherRequest, 1, AnswerChoice.O))))
        .doesNotHaveDuplicates();
    assertThat(
            List.of(
                fingerprints.advance(sessionId, new AdvanceLearningSessionCommand(requestId)),
                fingerprints.advance(otherSession, new AdvanceLearningSessionCommand(requestId)),
                fingerprints.advance(sessionId, new AdvanceLearningSessionCommand(otherRequest))))
        .doesNotHaveDuplicates();
  }
}
