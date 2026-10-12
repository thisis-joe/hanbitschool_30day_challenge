package kr.hanbit.school.content;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class ContentDigestTest {
  private final ObjectMapper mapper = new ObjectMapper();

  @Test
  void normalizedDigestUsesTheApprovedFieldOrderRegardlessOfInputKeyOrder() throws Exception {
    var ordered =
        mapper.readValue(
            """
            [{"day":1,"title":"하루","questions":[{"id":1,"text":"질문","answer":"O","explanation":"설명"}]}]
            """,
            HanbitContentDocument.class);
    var reordered =
        mapper.readValue(
            """
            [{"questions":[{"explanation":"설명","answer":"O","text":"질문","id":1}],"title":"하루","day":1}]
            """,
            HanbitContentDocument.class);

    assertThat(new ContentDigest().normalizedSha256(ordered))
        .isEqualTo("44b908f92bf604026361aef66dc6b000b48089eec1c7faeeac697858b052ca82")
        .isEqualTo(new ContentDigest().normalizedSha256(reordered));
  }
}
