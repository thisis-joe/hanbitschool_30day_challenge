package kr.hanbit.school.learning;

public record LearningStatus(
    String contentVersion,
    int calendarCap,
    Integer earliestUnpassedDay,
    int passedDayCount,
    int firstAnswerCount,
    long totalXp,
    int level,
    NextLearningAction nextAction,
    LearningSessionView activeSession) {}
