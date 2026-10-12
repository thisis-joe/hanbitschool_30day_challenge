package kr.hanbit.school.learning;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

public final class ExpiryRequestId {
  private ExpiryRequestId() {}

  public static UUID forQuestion(UUID sessionId, int currentPosition, Instant deadlineAt) {
    return UUID.nameUUIDFromBytes(
        ("learning-timeout-v1|" + sessionId + "|" + currentPosition + "|" + deadlineAt)
            .getBytes(StandardCharsets.UTF_8));
  }
}
