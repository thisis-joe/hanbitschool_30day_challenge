package kr.hanbit.school.staff.learning;
import java.util.List;
import java.util.UUID;
import kr.hanbit.school.content.LearningQuestion;
import kr.hanbit.school.learning.*;
public record TeacherLearningFacts(List<Student> students, List<LearningQuestion> questions,
    List<FirstAnswer> firstAnswers, List<DayProgress> progress, List<ReviewMastery> masteries) {
  public TeacherLearningFacts {
    students = List.copyOf(students);
    questions = List.copyOf(questions);
    firstAnswers = List.copyOf(firstAnswers);
    progress = List.copyOf(progress);
    masteries = List.copyOf(masteries);
  }
  public record Student(UUID accountId, int studentNumber, String name, String characterId) {}
}
