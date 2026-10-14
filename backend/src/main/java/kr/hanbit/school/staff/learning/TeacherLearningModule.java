package kr.hanbit.school.staff.learning;

import java.text.Normalizer;
import java.util.*;
import kr.hanbit.school.content.ContentCatalog;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class TeacherLearningModule {
  private final StaffLearningAccess access;
  private final ContentCatalog content;
  private final TeacherLearningFactsLoader loader;
  private final TeacherLearningAggregator aggregator;

  public TeacherLearningModule(StaffLearningAccess access, ContentCatalog content,
      TeacherLearningFactsLoader loader, TeacherLearningAggregator aggregator) {
    this.access = access;
    this.content = content;
    this.loader = loader;
    this.aggregator = aggregator;
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public TeacherStudentsPage students(AccountPrincipal principal, UUID classroomId, StudentListQuery query) {
    var classroom = access.requireClassroom(principal, classroomId);
    var search = Normalizer.normalize(query.search() == null ? "" : query.search().strip(), Normalizer.Form.NFC);
    if (search.codePointCount(0, search.length()) > 100)
      throw ApiException.validation("search", "검색어는 100자 이내로 입력해 주세요.");
    if (!Set.of("ALL", "NEW", "IN_PROGRESS", "COMPLETE").contains(query.status()))
      throw ApiException.validation("status", "학생 상태를 확인해 주세요.");
    var tie = Comparator.comparingInt(TeacherStudentRow::studentNumber)
        .thenComparing(s -> s.accountId().toString());
    Comparator<TeacherStudentRow> order = switch (query.sort()) {
      case "NUMBER" -> tie;
      case "PROGRESS_ASC" -> Comparator.comparingInt(TeacherStudentRow::answered).thenComparing(tie);
      case "PENDING_WRONG_DESC" -> Comparator.comparingInt(TeacherStudentRow::pendingWrong).reversed().thenComparing(tie);
      default -> throw ApiException.validation("sort", "학생 정렬을 확인해 주세요.");
    };
    if (query.page() < 0) throw ApiException.validation("page", "페이지는 0 이상이어야 합니다.");
    if (query.size() < 1 || query.size() > 50)
      throw ApiException.validation("size", "페이지 크기는 1~50이어야 합니다.");
    var facts = loader.load(classroom.getSchoolId(), classroomId, content.activeVersion().getVersion());
    Integer number = studentNumber(search);
    var rows = aggregator.students(facts).stream()
        .filter(s -> query.status().equals("ALL") || s.status().equals(query.status()))
        .filter(s -> search.isEmpty() || Normalizer.normalize(s.name(), Normalizer.Form.NFC).contains(search)
            || number != null && s.studentNumber() == number)
        .sorted(order).toList();
    long offset = (long) query.page() * query.size();
    var page = offset >= rows.size() ? List.<TeacherStudentRow>of()
        : rows.subList((int) offset, (int) Math.min(offset + query.size(), rows.size()));
    return new TeacherStudentsPage(aggregator.summarize(facts),
        new PageResult<>(page, query.page(), query.size(), rows.size()));
  }

  private Integer studentNumber(String search) {
    if (search.isEmpty() || !search.matches("[0-9]+")) return null;
    try { return Integer.valueOf(search); }
    catch (NumberFormatException ignored) { return null; }
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public TeacherStudentDetail student(AccountPrincipal principal, UUID classroomId,
      UUID studentId, AnswerListQuery query) {
    access.requireStudent(principal, classroomId, studentId);
    validatePageAndDay(query.day(), query.page(), query.size());
    if (!Set.of("WRONG", "TIMEOUT", "ALL", "UNANSWERED").contains(query.filter()))
      throw ApiException.validation("filter", "답변 필터를 확인해 주세요.");
    // requireStudent has revalidated the principal's current school and this exact enrollment.
    var facts = loader.load(principal.schoolId(), classroomId, content.activeVersion().getVersion());
    var roster = aggregator.students(facts);
    int index = java.util.stream.IntStream.range(0, roster.size())
        .filter(i -> roster.get(i).accountId().equals(studentId)).findFirst().orElseThrow(ApiException::forbidden);
    var allAnswers = aggregator.answers(facts, studentId);
    var selected = allAnswers.stream().filter(a -> query.day() == 0 || a.dayNumber() == query.day())
        .filter(a -> switch (query.filter()) {
          case "WRONG" -> a.outcome() == TeacherAnswerState.WRONG || a.outcome() == TeacherAnswerState.TIMED_OUT;
          case "TIMEOUT" -> a.outcome() == TeacherAnswerState.TIMED_OUT;
          case "ALL" -> a.outcome() != TeacherAnswerState.UNANSWERED;
          default -> a.outcome() == TeacherAnswerState.UNANSWERED;
        }).toList();
    return new TeacherStudentDetail(roster.get(index), aggregator.days(facts, studentId, allAnswers),
        page(selected, query.page(), query.size()), index == 0 ? null : roster.get(index - 1).accountId(),
        index + 1 == roster.size() ? null : roster.get(index + 1).accountId(), index + 1, roster.size(),
        aggregator.distinctionForAnswers(allAnswers, "O"), aggregator.distinctionForAnswers(allAnswers, "X"));
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public PageResult<TeacherQuestionRow> questions(AccountPrincipal principal, UUID classroomId,
      QuestionListQuery query) {
    var classroom = access.requireClassroom(principal, classroomId);
    validatePageAndDay(query.day(), query.page(), query.size());
    var search = Normalizer.normalize(query.search() == null ? "" : query.search().strip(), Normalizer.Form.NFC);
    if (search.codePointCount(0, search.length()) > 100)
      throw ApiException.validation("search", "검색어는 100자 이내로 입력해 주세요.");
    var tie = Comparator.comparingInt(TeacherQuestionRow::questionId);
    Comparator<TeacherQuestionRow> order = switch (query.sort()) {
      case "QUESTION_ASC" -> tie;
      case "WRONG_RATE_DESC" -> Comparator.comparing(TeacherQuestionRow::wrongRate,
          Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(tie);
      case "TIMEOUT_DESC" -> Comparator.comparingInt(TeacherQuestionRow::timedOut).reversed().thenComparing(tie);
      default -> throw ApiException.validation("sort", "문항 정렬을 확인해 주세요.");
    };
    var facts = loader.load(classroom.getSchoolId(), classroomId, content.activeVersion().getVersion());
    var number = studentNumber(search);
    var rows = aggregator.questions(facts).stream()
        .filter(q -> query.day() == 0 || q.dayNumber() == query.day())
        .filter(q -> search.isEmpty() || Normalizer.normalize(q.text(), Normalizer.Form.NFC).contains(search)
            || number != null && q.questionId() == number)
        .sorted(order).toList();
    return page(rows, query.page(), query.size());
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public TeacherQuestionDetail question(AccountPrincipal principal, UUID classroomId, int questionId) {
    var classroom = access.requireClassroom(principal, classroomId);
    if (questionId < 1 || questionId > 150)
      throw ApiException.validation("questionId", "문항 번호는 1~150이어야 합니다.");
    return aggregator.question(loader.load(classroom.getSchoolId(), classroomId,
        content.activeVersion().getVersion()), questionId);
  }

  private void validatePageAndDay(int day, int page, int size) {
    if (day < 0 || day > 30) throw ApiException.validation("day", "회차는 0~30이어야 합니다.");
    if (page < 0) throw ApiException.validation("page", "페이지는 0 이상이어야 합니다.");
    if (size < 1 || size > 50) throw ApiException.validation("size", "페이지 크기는 1~50이어야 합니다.");
  }

  private <T> PageResult<T> page(List<T> rows, int page, int size) {
    long offset = (long) page * size;
    var selected = offset >= rows.size() ? List.<T>of()
        : rows.subList((int) offset, (int) Math.min(offset + size, rows.size()));
    return new PageResult<>(selected, page, size, rows.size());
  }
}
