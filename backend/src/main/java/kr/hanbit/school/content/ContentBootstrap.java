package kr.hanbit.school.content;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
public class ContentBootstrap implements ApplicationRunner {
  static final String VERSION = "hanbit-v1";
  static final String DIGEST =
      "775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb";
  private final ContentImporter importer;

  public ContentBootstrap(ContentImporter importer) {
    this.importer = importer;
  }

  @Override
  public void run(ApplicationArguments args) {
    initialize();
  }

  public void initialize() {
    importer.install(VERSION, DIGEST, new ClassPathResource("content/hanbit-v1.json"));
  }
}
