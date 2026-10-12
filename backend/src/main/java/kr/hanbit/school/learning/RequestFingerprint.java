package kr.hanbit.school.learning;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class RequestFingerprint {
  private static final String START_PATH = "/api/student/learning/sessions";

  public String start(StartLearningSessionCommand command) {
    String questionIds =
        command.questionIds() == null || command.questionIds().isEmpty()
            ? "[]"
            : command.questionIds().stream()
                .map(id -> id == null ? "null" : "int:" + id)
                .collect(Collectors.joining(",", "[", "]"));
    String normalized =
        "operation=START_SESSION\n"
            + "method=POST\n"
            + "path="
            + START_PATH
            + "\nmode=enum:"
            + value(command.mode())
            + "\ndayNumber="
            + (command.dayNumber() == null ? "null" : "int:" + command.dayNumber())
            + "\nquestionIds="
            + questionIds
            + "\nrequestId="
            + (command.requestId() == null ? "null" : "uuid:" + command.requestId());
    return sha256(normalized);
  }

  public String answer(UUID sessionId, SubmitAnswerCommand command) {
    return sha256(
        "operation=SUBMIT_ANSWER\nmethod=POST\npath="
            + START_PATH + "/" + sessionId + "/answers"
            + "\nquestionId=int:" + command.questionId()
            + "\nchoice=enum:" + value(command.choice())
            + "\nrequestId=uuid:" + command.requestId());
  }

  public String advance(UUID sessionId, AdvanceLearningSessionCommand command) {
    return sha256(
        "operation=ADVANCE_SESSION\nmethod=POST\npath="
            + START_PATH + "/" + sessionId + "/advance"
            + "\nrequestId=uuid:" + command.requestId());
  }

  private String value(Enum<?> value) {
    return value == null ? "null" : value.name();
  }

  private String sha256(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", e);
    }
  }
}
