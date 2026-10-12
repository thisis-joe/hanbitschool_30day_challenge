package kr.hanbit.school.content;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ContentCatalog {
  private final ContentVersionRepository versions;
  private final LearningQuestionRepository questions;

  public ContentCatalog(
      ContentVersionRepository versions, LearningQuestionRepository questions) {
    this.versions = versions;
    this.questions = questions;
  }

  public ContentVersion activeVersion() {
    return versions
        .findByActiveTrue()
        .orElseThrow(() -> new IllegalStateException("활성 학습 콘텐츠가 없습니다."));
  }

  public LearningQuestion requireQuestion(String version, int id) {
    return questions
        .findByIdVersionAndIdQuestionId(version, id)
        .orElseThrow(() -> new IllegalArgumentException("학습 문항을 찾을 수 없습니다."));
  }

  public List<LearningQuestion> questionsForDay(String version, int day) {
    return List.copyOf(questions.findByIdVersionAndDayOrderByPositionAsc(version, day));
  }
}
