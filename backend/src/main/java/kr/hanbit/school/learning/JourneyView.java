package kr.hanbit.school.learning;

import java.util.List;
import java.util.UUID;

public record JourneyView(
    String contentVersion,
    int calendarCap,
    NextLearningAction nextAction,
    UUID activeSessionId,
    int firstAnswerCount,
    int journeyPosition,
    boolean courseCompleted,
    List<JourneyDay> days,
    List<JourneyQuestion> questions) {}
