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
}
