package kr.hanbit.school.content;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class ContentDigest {
  private final ObjectMapper mapper;

  public ContentDigest() {
    this(new ObjectMapper());
  }

  ContentDigest(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  public String normalizedSha256(HanbitContentDocument document) {
    try {
      byte[] normalized = mapper.writeValueAsBytes(document.days());
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalized));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256을 사용할 수 없습니다.", e);
    }
  }
}
