package kr.hanbit.school.staff.learning;
public record TeacherQuestionRow(int questionId, int dayNumber, String text, String correctChoice,
    int answered, int correct, int choiceWrong, int timedOut, int wrong, int unanswered, Double wrongRate) {}
