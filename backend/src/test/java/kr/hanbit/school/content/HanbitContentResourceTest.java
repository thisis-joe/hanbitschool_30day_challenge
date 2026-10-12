package kr.hanbit.school.content;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class HanbitContentResourceTest {
  private static final String RESOURCE = "/content/hanbit-v1.json";
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void approvedResourceHasCanonicalBytesAndLearningStructure() throws Exception {
    byte[] raw;
    try (var input = getClass().getResourceAsStream(RESOURCE)) {
      assertThat(input).as(RESOURCE).isNotNull();
      raw = input.readAllBytes();
    }

    assertThat(sha256(raw))
        .isEqualTo("c59de1f6028f4669a41c60c9eee573ae8c4e7ec08c7350036512d2dac638a698");
    var document = mapper.readValue(raw, HanbitContentDocument.class);
    var allQuestions = document.days().stream().flatMap(day -> day.questions().stream()).toList();

    assertThat(document.days()).hasSize(30);
    assertThat(document.days()).extracting(HanbitContentDocument.DayEntry::day)
        .containsExactly(IntStream.rangeClosed(1, 30).boxed().toArray(Integer[]::new));
    assertThat(document.days()).allSatisfy(day -> assertThat(day.questions()).hasSize(5));
    assertThat(allQuestions)
        .hasSize(150)
        .extracting(HanbitContentDocument.QuestionEntry::id)
        .containsExactly(IntStream.rangeClosed(1, 150).boxed().toArray(Integer[]::new));
    assertThat(allQuestions).filteredOn(question -> question.answer() == AnswerChoice.O).hasSize(87);
    assertThat(allQuestions).filteredOn(question -> question.answer() == AnswerChoice.X).hasSize(63);

    document.days().forEach(
        day -> {
          assertNfcNonBlank(day.title());
          IntStream.range(0, day.questions().size())
              .forEach(
                  index -> {
                    var question = day.questions().get(index);
                    assertThat(question.id()).isEqualTo((day.day() - 1) * 5 + index + 1);
                    assertNfcNonBlank(question.text());
                    assertNfcNonBlank(question.explanation());
                  });
        });

    byte[] normalized = mapper.writeValueAsBytes(document.days());
    assertThat(normalized).hasSize(29_590);
    assertThat(new String(normalized, StandardCharsets.UTF_8)).doesNotEndWith("\n");
    assertThat(new ContentDigest().normalizedSha256(document))
        .isEqualTo("775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb");
  }

  private static void assertNfcNonBlank(String value) {
    assertThat(value).isNotBlank();
    assertThat(Normalizer.isNormalized(value, Normalizer.Form.NFC)).isTrue();
  }

  private static String sha256(byte[] bytes) throws Exception {
    return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }
}
