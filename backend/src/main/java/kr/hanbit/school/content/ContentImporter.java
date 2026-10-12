package kr.hanbit.school.content;

import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class ContentImporter {
  private final ObjectMapper mapper;
  private final ContentDigest digest;
  private final QuestionTimeLimit timeLimit;
  private final ContentVersionRepository versions;
  private final ContentDayRepository days;
  private final LearningQuestionRepository questions;

  public ContentImporter(
      ObjectMapper mapper,
      ContentDigest digest,
      QuestionTimeLimit timeLimit,
      ContentVersionRepository versions,
      ContentDayRepository days,
      LearningQuestionRepository questions) {
    this.mapper = mapper;
    this.digest = digest;
    this.timeLimit = timeLimit;
    this.versions = versions;
    this.days = days;
    this.questions = questions;
  }

  @Transactional
  public void install(String version, String expectedDigest, Resource resource) {
    var document = read(resource);
    validateDocument(document);
    String actualDigest = digest.normalizedSha256(document);
    if (!actualDigest.equals(expectedDigest))
      throw new IllegalStateException("승인된 학습 콘텐츠 해시와 일치하지 않습니다.");

    var installed = versions.findById(version);
    if (installed.isPresent()) {
      if (!installed.get().getDigest().equals(expectedDigest))
        throw new IllegalStateException("설치된 학습 콘텐츠 해시가 다릅니다.");
      requireExactRows(version, document);
      return;
    }

    boolean active = versions.findByActiveTrue().isEmpty();
    versions.save(new ContentVersion(version, expectedDigest, active));
    var dayRows = new ArrayList<ContentDay>(30);
    var questionRows = new ArrayList<LearningQuestion>(150);
    for (var day : document.days()) {
      dayRows.add(new ContentDay(version, day.day(), day.title()));
      for (int index = 0; index < day.questions().size(); index++) {
        var question = day.questions().get(index);
        questionRows.add(toRow(version, day.day(), index + 1, question));
      }
    }
    days.saveAll(dayRows);
    questions.saveAllAndFlush(questionRows);
  }

  private HanbitContentDocument read(Resource resource) {
    try (var input = resource.getInputStream()) {
      return mapper.readValue(input, HanbitContentDocument.class);
    } catch (IOException | RuntimeException e) {
      throw new IllegalStateException("학습 콘텐츠를 읽을 수 없습니다.", e);
    }
  }

  private void validateDocument(HanbitContentDocument document) {
    if (document.days().size() != 30) invalid();
    for (int dayIndex = 0; dayIndex < document.days().size(); dayIndex++) {
      var day = document.days().get(dayIndex);
      if (day.day() != dayIndex + 1 || day.questions().size() != 5 || !validText(day.title()))
        invalid();
      for (int questionIndex = 0; questionIndex < day.questions().size(); questionIndex++) {
        var question = day.questions().get(questionIndex);
        int expectedId = dayIndex * 5 + questionIndex + 1;
        if (question.id() != expectedId
            || question.answer() == null
            || !validText(question.text())
            || !validText(question.explanation())) invalid();
      }
    }
  }

  private static boolean validText(String value) {
    return value != null
        && !value.isBlank()
        && Normalizer.isNormalized(value, Normalizer.Form.NFC);
  }

  private static void invalid() {
    throw new IllegalStateException("학습 콘텐츠 구조가 올바르지 않습니다.");
  }

  private LearningQuestion toRow(
      String version, int day, int position, HanbitContentDocument.QuestionEntry question) {
    return new LearningQuestion(
        version,
        question.id(),
        day,
        position,
        question.text(),
        question.answer(),
        question.explanation(),
        timeLimit.secondsFor(question.text()));
  }

  private void requireExactRows(String version, HanbitContentDocument document) {
    var storedDays = days.findByIdVersionOrderByIdDayAsc(version);
    var storedQuestions = questions.findByIdVersionOrderByIdQuestionIdAsc(version);
    if (storedDays.size() != 30 || storedQuestions.size() != 150) corrupt();

    int questionOffset = 0;
    for (int dayIndex = 0; dayIndex < document.days().size(); dayIndex++) {
      var expectedDay = document.days().get(dayIndex);
      var actualDay = storedDays.get(dayIndex);
      if (actualDay.getDay() != expectedDay.day()
          || !actualDay.getTitle().equals(expectedDay.title())) corrupt();
      for (int position = 1; position <= expectedDay.questions().size(); position++) {
        var expectedQuestion = expectedDay.questions().get(position - 1);
        var actualQuestion = storedQuestions.get(questionOffset++);
        if (actualQuestion.getQuestionId() != expectedQuestion.id()
            || actualQuestion.getDay() != expectedDay.day()
            || actualQuestion.getPosition() != position
            || !actualQuestion.getText().equals(expectedQuestion.text())
            || actualQuestion.getAnswer() != expectedQuestion.answer()
            || !actualQuestion.getExplanation().equals(expectedQuestion.explanation())
            || actualQuestion.getTimeLimitSeconds() != timeLimit.secondsFor(expectedQuestion.text()))
          corrupt();
      }
    }
  }

  private static void corrupt() {
    throw new IllegalStateException("설치된 학습 콘텐츠가 승인 정본과 다릅니다.");
  }
}
