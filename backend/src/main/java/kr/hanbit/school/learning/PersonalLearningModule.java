package kr.hanbit.school.learning;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import kr.hanbit.school.content.ContentCatalog;
import kr.hanbit.school.content.LearningQuestionRepository;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PersonalLearningModule {
  private final StudentLearningAccess access;
  private final ContentCatalog content;
  private final LearningQuestionRepository questions;
  private final FirstAnswerRepository firstAnswers;
  private final ReviewMasteryRepository masteries;
  private final ReviewQueueEntryRepository queue;
  private final PrivateBookmarkRepository bookmarks;
  private final EntityManager entities;
  private final Clock clock;

  public PersonalLearningModule(
      StudentLearningAccess access,
      ContentCatalog content,
      LearningQuestionRepository questions,
      FirstAnswerRepository firstAnswers,
      ReviewMasteryRepository masteries,
      ReviewQueueEntryRepository queue,
      PrivateBookmarkRepository bookmarks,
      EntityManager entities,
      Clock clock) {
    this.access = access;
    this.content = content;
    this.questions = questions;
    this.firstAnswers = firstAnswers;
    this.masteries = masteries;
    this.queue = queue;
    this.bookmarks = bookmarks;
    this.entities = entities;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public List<PersonalQuestionView> list(
      AccountPrincipal principal, PersonalQuestionFilter filter) {
    var student = access.requireStudent(principal);
    if (filter == null) throw ApiException.validation("filter", "개인 목록을 선택해 주세요.");
    String predicate =
        switch (filter) {
          case REVIEW_QUEUE -> "r.active = true";
          case MASTERED -> "m.id.questionId is not null";
          case BOOKMARKED -> "b.id.questionId is not null";
        };
    return entities
        .createQuery(
            """
            select new kr.hanbit.school.learning.PersonalQuestionView(
              q.id.questionId, q.day, q.position, q.text,
              coalesce(r.active, false), m.id.questionId is not null,
              b.id.questionId is not null, a.outcome, a.answeredAt)
            from LearningQuestion q
            left join ReviewQueueEntry r on r.id.studentAccountId = :student
              and r.id.version = q.id.version and r.id.questionId = q.id.questionId
            left join ReviewMastery m on m.id.studentAccountId = :student
              and m.id.version = q.id.version and m.id.questionId = q.id.questionId
            left join PrivateBookmark b on b.id.studentAccountId = :student
              and b.id.version = q.id.version and b.id.questionId = q.id.questionId
            left join LastAnswer a on a.id.studentAccountId = :student
              and a.id.version = q.id.version and a.id.questionId = q.id.questionId
            where q.id.version = :version and
            """
                + predicate
                + " order by q.day, q.position",
            PersonalQuestionView.class)
        .setParameter("student", student.studentAccountId())
        .setParameter("version", content.activeVersion().getVersion())
        .getResultList();
  }

  @Transactional
  public void addReviewQueue(AccountPrincipal principal, int questionId) {
    var student = access.lockStudent(principal);
    String version = requireQuestion(questionId);
    UUID studentId = student.studentAccountId();
    var last = lockLastAnswer(studentId, version, questionId);
    var key = new ReviewQueueEntryId(studentId, version, questionId);
    var entry = queue.findLockedById(key);
    if (entry.isPresent()
        && entry.get().isActive()
        && entry.get().getReason() == ReviewQueueReason.USER_AFTER_LATER_WRONG) return;
    boolean priorCorrect =
        masteries.existsById(new ReviewMasteryId(studentId, version, questionId))
            || firstAnswers
                .findByStudentAccountIdAndVersionAndQuestionId(studentId, version, questionId)
                .map(FirstAnswer::isCorrect)
                .orElse(false);
    if (last == null || last.getOutcome() == AnswerOutcome.CORRECT || !priorCorrect)
      throw ApiException.validation("questionId", "다시 볼 문제로 추가할 수 없는 문항입니다.");
    var now = LearningTime.persistable(clock.instant());
    var row =
        entry.orElseGet(
            () ->
                new ReviewQueueEntry(
                    studentId,
                    version,
                    questionId,
                    ReviewQueueReason.USER_AFTER_LATER_WRONG,
                    true,
                    now,
                    null));
    row.activateUser(now);
    queue.saveAndFlush(row);
  }

  @Transactional
  public void removeReviewQueue(AccountPrincipal principal, int questionId) {
    var student = access.lockStudent(principal);
    String version = requireQuestion(questionId);
    lockLastAnswer(student.studentAccountId(), version, questionId);
    queue
        .findLockedById(new ReviewQueueEntryId(student.studentAccountId(), version, questionId))
        .ifPresent(
            row -> {
              row.release(clock.instant());
              queue.saveAndFlush(row);
            });
  }

  @Transactional
  public void addBookmark(AccountPrincipal principal, int questionId) {
    var student = access.lockStudent(principal);
    String version = requireQuestion(questionId);
    var key = new PrivateBookmarkId(student.studentAccountId(), version, questionId);
    if (bookmarks.existsById(key)) return;
    bookmarks.saveAndFlush(
        new PrivateBookmark(student.studentAccountId(), version, questionId, clock.instant()));
  }

  @Transactional
  public void removeBookmark(AccountPrincipal principal, int questionId) {
    var student = access.lockStudent(principal);
    String version = requireQuestion(questionId);
    var row =
        entities.find(
            PrivateBookmark.class,
            new PrivateBookmarkId(student.studentAccountId(), version, questionId),
            LockModeType.PESSIMISTIC_WRITE);
    if (row != null) {
      bookmarks.delete(row);
      bookmarks.flush();
    }
  }

  private LastAnswer lockLastAnswer(UUID studentId, String version, int questionId) {
    // Finalization flushes LastAnswer before touching the queue. Follow the same order so
    // eligibility sees its committed outcome and manual transitions cannot be overwritten.
    return entities.find(
        LastAnswer.class,
        new LastAnswerId(studentId, version, questionId),
        LockModeType.PESSIMISTIC_WRITE);
  }

  private String requireQuestion(int questionId) {
    String version = content.activeVersion().getVersion();
    questions
        .findByIdVersionAndIdQuestionId(version, questionId)
        .orElseThrow(() -> new ApiException(404, "NOT_FOUND", "학습 문항을 찾을 수 없습니다."));
    return version;
  }
}
