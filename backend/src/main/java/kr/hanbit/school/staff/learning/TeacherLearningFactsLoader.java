package kr.hanbit.school.staff.learning;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import kr.hanbit.school.account.*;
import kr.hanbit.school.content.LearningQuestionRepository;
import kr.hanbit.school.game.StudentAppearanceRepository;
import kr.hanbit.school.learning.*;
import org.springframework.stereotype.Service;

@Service
public class TeacherLearningFactsLoader {
  private final StudentProfileRepository profiles;
  private final AccountRepository accounts;
  private final StudentAppearanceRepository appearances;
  private final LearningQuestionRepository questions;
  private final FirstAnswerRepository first;
  private final DayProgressRepository progress;
  private final ReviewMasteryRepository masteries;

  public TeacherLearningFactsLoader(StudentProfileRepository profiles, AccountRepository accounts,
      StudentAppearanceRepository appearances, LearningQuestionRepository questions,
      FirstAnswerRepository first, DayProgressRepository progress, ReviewMasteryRepository masteries) {
    this.profiles = profiles;
    this.accounts = accounts;
    this.appearances = appearances;
    this.questions = questions;
    this.first = first;
    this.progress = progress;
    this.masteries = masteries;
  }

  public TeacherLearningFacts load(UUID schoolId, UUID classroomId, String version) {
    var roster = profiles.findByClassroomIdOrderByStudentNumber(classroomId);
    var ids = roster.stream().map(StudentProfile::getAccountId).toList();
    var names = accounts.findAllById(ids).stream()
        .filter(a -> a.getSchoolId().equals(schoolId) && a.getRole() == Role.STUDENT)
        .collect(Collectors.toMap(Account::getId, Function.identity()));
    var validIds = ids.stream().filter(names::containsKey).toList();
    var characters = new HashMap<UUID, String>();
    if (!validIds.isEmpty())
      for (var appearance : appearances.findCharactersByAccountIds(validIds))
        characters.put(appearance.getAccountId(), appearance.getCharacterId());
    var students = roster.stream().filter(p -> names.containsKey(p.getAccountId()))
        .map(p -> new TeacherLearningFacts.Student(p.getAccountId(), p.getStudentNumber(),
            names.get(p.getAccountId()).getName(), characters.get(p.getAccountId())))
        .toList();
    var canonical = questions.findByIdVersionOrderByIdQuestionIdAsc(version);
    if (validIds.isEmpty())
      return new TeacherLearningFacts(students, canonical, List.of(), List.of(), List.of());
    return new TeacherLearningFacts(students, canonical,
        first.findByStudentAccountIdInAndVersion(validIds, version),
        progress.findByStudentAccountIdInAndVersionAndState(validIds, version, DayProgressState.PASSED),
        masteries.findByIdStudentAccountIdInAndIdVersion(validIds, version));
  }
}
