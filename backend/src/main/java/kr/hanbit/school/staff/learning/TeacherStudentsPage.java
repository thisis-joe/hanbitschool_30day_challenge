package kr.hanbit.school.staff.learning;
public record TeacherStudentsPage(TeacherLearningSummary summary, PageResult<TeacherStudentRow> students) {}
