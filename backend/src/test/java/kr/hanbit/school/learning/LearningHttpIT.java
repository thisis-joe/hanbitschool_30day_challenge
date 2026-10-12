package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.hanbit.school.account.Account;
import kr.hanbit.school.classroom.Classroom;
import kr.hanbit.school.classroom.School;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.MutableClock;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.TestFixtures;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "server.servlet.session.cookie.secure=false")
@Import({PostgresTestConfiguration.class, LearningTestClockConfiguration.class})
class LearningHttpIT {
  private static final Instant START = Instant.parse("2026-10-12T00:00:00.123456789Z");
  private static final String ROOT = "/api/student/learning";
  private static final String[] PRIVATE_FIELDS = {
    "reviewQueue",
    "review_queue",
    "inReviewQueue",
    "mastery",
    "mastered",
    "review_masteries",
    "privateBookmark",
    "private_bookmarks",
    "bookmarked",
    "lastAnswer",
    "last_answers",
    "lastOutcome",
    "lastAnsweredAt",
    "reviewPromptEligible",
    "firstCorrectAttempt",
    "correctChoice",
    "explanation",
    "AUTO_FIRST_WRONG",
    "USER_AFTER_LATER_WRONG"
  };

  @LocalServerPort int port;
  @Autowired TestFixtures fixtures;
  @Autowired MutableClock clock;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper json;
  private final List<HttpClient> clients = new ArrayList<>();

  @BeforeEach
  void setServerTime() {
    clock.setInstant(START);
  }

  @AfterEach
  void closeClients() {
    clients.forEach(HttpClient::close);
  }

  @Test
  void secondAuthenticatedDeviceRestoresTheSameQuestionDeadlineAndPersistedFeedback()
      throws Exception {
    var student = studentFixture();
    var first = device();
    first.loginStudent(student.classroom(), 1);
    var status = ok(first.get(ROOT + "/status"));
    assertThat(status.path("contentVersion").asString()).isEqualTo("hanbit-v1");
    assertThat(status.path("calendarCap").asInt()).isEqualTo(1);
    assertThat(status.path("earliestUnpassedDay").asInt()).isEqualTo(1);
    assertThat(status.path("firstAnswerCount").asInt()).isZero();
    assertThat(status.path("totalXp").asLong()).isZero();
    assertThat(status.path("nextAction").asString()).isEqualTo("START_FIRST");
    assertNoUnfinalizedAnswer(status);

    var startRequest = dayStart("FIRST");
    var started = ok(first.mutate("POST", ROOT + "/sessions", startRequest));
    var sessionPath = ROOT + "/sessions/" + started.path("sessionId").asString();
    assertThat(started.path("state").asString()).isEqualTo("QUESTION_ACTIVE");
    assertThat(started.path("question").path("questionId").asInt()).isEqualTo(1);
    assertThat(started.path("lastAnswer").isNull()).isTrue();
    assertThat(
            Instant.parse(started.path("question").path("deadlineAt").asString()).getNano() % 1000)
        .isZero();
    assertNoUnfinalizedAnswer(started);
    assertNoUnfinalizedAnswer(ok(first.get(sessionPath)));
    assertNoUnfinalizedAnswer(ok(first.get(ROOT + "/status")));

    clock.setInstant(START.plusSeconds(1));
    var answerRequest = answerBody(1, "O");
    var answered = ok(first.mutate("POST", sessionPath + "/answers", answerRequest));
    assertThat(answered.path("outcome").asString()).isEqualTo("CORRECT");
    assertThat(answered.path("correctChoice").asString()).isEqualTo("O");
    assertThat(answered.path("explanation").asString()).isEqualTo("소리가 크게 났다는 것은 물리적 사실입니다.");
    assertThat(answered.path("xpAwarded").asLong()).isEqualTo(565);
    assertThat(answered.path("totalXp").asLong()).isEqualTo(565);
    assertThat(answered.path("attemptAnsweredCount").asInt()).isEqualTo(1);

    clock.setInstant(START.plusSeconds(2));
    var second = device();
    second.loginStudent(student.classroom(), 1);
    assertThat(second.sessionCookie()).isNotEqualTo(first.sessionCookie());
    var restored = ok(second.get(sessionPath));
    assertThat(restored.path("sessionId")).isEqualTo(started.path("sessionId"));
    assertThat(restored.path("question")).isEqualTo(started.path("question"));
    assertThat(restored.path("state").asString()).isEqualTo("AWAITING_ADVANCE");
    assertThat(restored.path("lastAnswer")).isEqualTo(answered);
    assertThat(ok(second.get(ROOT + "/status")).path("activeSession")).isEqualTo(restored);
    assertThat(ok(second.mutate("POST", ROOT + "/sessions", dayStart("FIRST"))))
        .isEqualTo(restored);
    var beforeRetry = learningSnapshot();
    assertThat(ok(second.mutate("POST", sessionPath + "/answers", answerRequest)))
        .isEqualTo(answered);
    assertThat(learningSnapshot()).isEqualTo(beforeRetry);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from first_answers where student_account_id=?",
                Long.class,
                student.account().getId()))
        .isEqualTo(1);

    var next = ok(second.mutate("POST", sessionPath + "/advance", requestId()));
    assertThat(next.path("question").path("questionId").asInt()).isEqualTo(2);
    assertThat(next.path("lastAnswer").isNull()).isTrue();
    assertNoUnfinalizedAnswer(next);
    assertThat(ok(first.get(sessionPath))).isEqualTo(next);
  }

  @Test
  void unauthenticatedAndStaffClientsCannotUseStudentLearningRoutes() throws Exception {
    var student = studentFixture();
    var owner = device();
    owner.loginStudent(student.classroom(), 1);
    var started = ok(owner.mutate("POST", ROOT + "/sessions", dayStart("FIRST")));
    String sessionPath = ROOT + "/sessions/" + started.path("sessionId").asString();
    var anonymous = device();
    var teacher = device();
    teacher.loginStaff(student.teacher());
    var administrator = device();
    administrator.loginStaff(fixtures.admin(student.school()));
    var before = learningSnapshot();
    for (var rejected : List.of(anonymous, teacher, administrator)) {
      int expectedStatus = rejected == anonymous ? 401 : 403;
      String expectedCode = rejected == anonymous ? "UNAUTHENTICATED" : "FORBIDDEN";
      for (String path :
          List.of(
              ROOT + "/status",
              sessionPath,
              ROOT + "/questions?filter=REVIEW_QUEUE",
              ROOT + "/questions?filter=MASTERED",
              ROOT + "/questions?filter=BOOKMARKED")) {
        assertError(rejected.get(path), expectedStatus, expectedCode);
      }
      for (var mutation : mutations(sessionPath)) {
        assertError(
            rejected.mutate(mutation.method(), mutation.path(), mutation.body()),
            expectedStatus,
            expectedCode);
      }
    }
    assertThat(learningSnapshot()).isEqualTo(before);
  }

  @Test
  void missingAndInvalidCsrfRejectLearningWritesWithoutAnyMutation() throws Exception {
    var student = studentFixture();
    var owner = device();
    owner.loginStudent(student.classroom(), 1);
    var started = ok(owner.mutate("POST", ROOT + "/sessions", dayStart("FIRST")));
    String sessionPath = ROOT + "/sessions/" + started.path("sessionId").asString();
    var before = learningSnapshot();
    for (var mutation : mutations(sessionPath)) {
      assertError(
          owner.request(mutation.method(), mutation.path(), mutation.body(), null),
          403,
          "INVALID_CSRF_TOKEN");
      var token = owner.csrf();
      assertError(
          owner.request(
              mutation.method(),
              mutation.path(),
              mutation.body(),
              new Csrf(token.header(), "invalid-token")),
          403,
          "INVALID_CSRF_TOKEN");
    }
    assertThat(learningSnapshot()).isEqualTo(before);
  }

  @Test
  void loginRequiresCsrfBeforeAuthenticatingTheNetworkClient() throws Exception {
    var student = studentFixture();
    var unauthenticated = device();
    var body = studentLogin(student.classroom(), 1);
    assertError(
        unauthenticated.request("POST", "/api/auth/students/login", body, null),
        403,
        "INVALID_CSRF_TOKEN");
    var token = unauthenticated.csrf();
    assertError(
        unauthenticated.request(
            "POST", "/api/auth/students/login", body, new Csrf(token.header(), "invalid-token")),
        403,
        "INVALID_CSRF_TOKEN");
    assertError(unauthenticated.get(ROOT + "/status"), 401, "UNAUTHENTICATED");
    unauthenticated.loginStudent(student.classroom(), 1);
    assertThat(ok(unauthenticated.get(ROOT + "/status")).path("firstAnswerCount").asInt()).isZero();
  }

  @Test
  void otherStudentCannotReadOrMutateSession() throws Exception {
    var student = studentFixture();
    fixtures.student(student.classroom(), 2, "다른 학생", "다른 비공개 별명");
    var owner = device();
    owner.loginStudent(student.classroom(), 1);
    var stranger = device();
    stranger.loginStudent(student.classroom(), 2);
    var started = ok(owner.mutate("POST", ROOT + "/sessions", dayStart("FIRST")));
    String sessionPath = ROOT + "/sessions/" + started.path("sessionId").asString();
    for (int phase = 0; phase < 2; phase++) {
      var before = learningSnapshot();
      var hidden = stranger.get(sessionPath);
      assertError(hidden, 404, "NOT_FOUND");
      var missing = stranger.get(ROOT + "/sessions/" + UUID.randomUUID());
      assertError(missing, 404, "NOT_FOUND");
      assertThat(tree(hidden)).isEqualTo(tree(missing));
      assertError(
          stranger.mutate("POST", sessionPath + "/answers", answerBody(1, "O")), 404, "NOT_FOUND");
      assertError(stranger.mutate("POST", sessionPath + "/advance", requestId()), 404, "NOT_FOUND");
      assertThat(learningSnapshot()).isEqualTo(before);
      if (phase == 0) {
        var feedback = ok(owner.mutate("POST", sessionPath + "/answers", answerBody(1, "X")));
        assertThat(feedback.path("outcome").asString()).isEqualTo("WRONG");
        assertThat(ok(owner.get(sessionPath)).path("lastAnswer")).isEqualTo(feedback);
      }
    }
    assertThat(ok(stranger.get(ROOT + "/status")).path("firstAnswerCount").asInt()).isZero();
    assertThat(ok(stranger.get(ROOT + "/questions?filter=REVIEW_QUEUE")).isEmpty()).isTrue();
    assertThat(ok(owner.get(ROOT + "/questions?filter=REVIEW_QUEUE")).size()).isEqualTo(1);
  }

  @Test
  void staffAndPublicClassroomResponsesOmitEveryPrivateLearningField() throws Exception {
    var student = studentFixture();
    var owner = device();
    owner.loginStudent(student.classroom(), 1);
    var assigned = device();
    assigned.loginStaff(student.teacher());
    var reader = device();
    reader.loginStaff(fixtures.teacher(student.school()));
    var administrator = device();
    administrator.loginStaff(fixtures.admin(student.school()));
    var staffClients = List.of(assigned, reader, administrator);
    var before = classroomResponses(staffClients, student);

    var first = ok(owner.mutate("POST", ROOT + "/sessions", dayStart("FIRST")));
    String firstPath = ROOT + "/sessions/" + first.path("sessionId").asString();
    var wrongChoices = List.of("X", "O", "X", "O", "X");
    for (int question = 1; question <= 5; question++) {
      var wrong =
          ok(
              owner.mutate(
                  "POST",
                  firstPath + "/answers",
                  answerBody(question, wrongChoices.get(question - 1))));
      assertThat(wrong.path("outcome").asString()).isEqualTo("WRONG");
      if (question < 5) ok(owner.mutate("POST", firstPath + "/advance", requestId()));
    }
    var review =
        ok(
            owner.mutate(
                "POST",
                ROOT + "/sessions",
                Map.of(
                    "mode", "REVIEW", "questionIds", List.of(1), "requestId", UUID.randomUUID())));
    var mastered =
        ok(
            owner.mutate(
                "POST",
                ROOT + "/sessions/" + review.path("sessionId").asString() + "/answers",
                answerBody(1, "O")));
    assertThat(mastered.path("outcome").asString()).isEqualTo("CORRECT");
    var replay = ok(owner.mutate("POST", ROOT + "/sessions", dayStart("REPLAY")));
    var laterWrong =
        ok(
            owner.mutate(
                "POST",
                ROOT + "/sessions/" + replay.path("sessionId").asString() + "/answers",
                answerBody(1, "X")));
    assertThat(laterWrong.path("reviewPromptEligible").asBoolean()).isTrue();
    assertThat(owner.mutate("PUT", ROOT + "/review-queue/1", null).statusCode()).isEqualTo(204);
    for (int question : List.of(1, 2)) {
      assertThat(owner.mutate("PUT", ROOT + "/bookmarks/" + question, null).statusCode())
          .isEqualTo(204);
    }
    var privateList = ok(owner.get(ROOT + "/questions?filter=BOOKMARKED"));
    assertThat(privateList.size()).isEqualTo(2);
    assertThat(privateList.get(0).path("questionId").asInt()).isEqualTo(1);
    assertThat(privateList.get(0).path("inReviewQueue").asBoolean()).isTrue();
    assertThat(privateList.get(0).path("mastered").asBoolean()).isTrue();
    assertThat(privateList.get(0).path("bookmarked").asBoolean()).isTrue();
    assertThat(privateList.get(0).path("lastOutcome").asString()).isEqualTo("WRONG");
    var after = classroomResponses(staffClients, student);
    assertThat(after).isEqualTo(before);
    for (var body : after.values()) {
      assertThat(body.toString())
          .doesNotContain(PRIVATE_FIELDS)
          .doesNotContain(
              mastered.path("attemptAnswerId").asString(),
              laterWrong.path("attemptAnswerId").asString(),
              review.path("sessionId").asString(),
              replay.path("sessionId").asString());
    }
  }

  private Map<String, JsonNode> classroomResponses(List<Device> staff, StudentFixture student)
      throws Exception {
    var result = new LinkedHashMap<String, JsonNode>();
    var paths =
        List.of(
            "/api/staff/classrooms",
            "/api/staff/classrooms?scope=SCHOOL",
            "/api/staff/classrooms/" + student.classroom().getId() + "/students");
    for (int index = 0; index < staff.size(); index++) {
      for (String path : paths) result.put(index + path, ok(staff.get(index).get(path)));
    }
    var publicClient = device();
    for (String path :
        List.of(
            "/api/public/schools",
            "/api/public/schools/" + student.school().getId() + "/classrooms"))
      result.put(path, ok(publicClient.get(path)));
    return result;
  }

  private StudentFixture studentFixture() {
    var school = fixtures.school("실제 HTTP 학습 학교");
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1, LocalDate.of(2026, 10, 12));
    return new StudentFixture(
        fixtures.student(classroom, 1, "학생", "비공개 별명"), classroom, teacher, school);
  }

  private Map<String, Object> studentLogin(Classroom classroom, int number) {
    return Map.of(
        "schoolId",
        classroom.getSchoolId(),
        "gradeLabel",
        classroom.getGradeLabel(),
        "classNumber",
        classroom.getClassNumber(),
        "studentNumber",
        number,
        "password",
        TestFixtures.PASSWORD);
  }

  private static Map<String, Object> requestId() {
    return Map.of("requestId", UUID.randomUUID());
  }

  private static Map<String, Object> dayStart(String mode) {
    return Map.of(
        "mode", mode, "dayNumber", 1, "questionIds", List.of(), "requestId", UUID.randomUUID());
  }

  private static Map<String, Object> answerBody(int question, String choice) {
    return Map.of("requestId", UUID.randomUUID(), "questionId", question, "choice", choice);
  }

  private static List<Mutation> mutations(String sessionPath) {
    return List.of(
        new Mutation("POST", ROOT + "/sessions", dayStart("FIRST")),
        new Mutation("POST", sessionPath + "/answers", answerBody(1, "O")),
        new Mutation("POST", sessionPath + "/advance", requestId()),
        new Mutation("PUT", ROOT + "/review-queue/1", null),
        new Mutation("DELETE", ROOT + "/review-queue/1", null),
        new Mutation("PUT", ROOT + "/bookmarks/1", null),
        new Mutation("DELETE", ROOT + "/bookmarks/1", null));
  }

  private Map<String, String> learningSnapshot() {
    var result = new LinkedHashMap<String, String>();
    for (String table :
        List.of(
            "day_progress",
            "learning_sessions",
            "learning_session_questions",
            "day_attempts",
            "idempotency_records",
            "first_answers",
            "last_answers",
            "xp_entries",
            "review_attempts",
            "review_masteries",
            "review_queue_entries",
            "private_bookmarks")) {
      result.put(
          table,
          jdbc.queryForObject(
              "select coalesce(jsonb_agg(to_jsonb(t)"
                  + " order by to_jsonb(t)::text)::text,'[]') from "
                  + table
                  + " t",
              String.class));
    }
    return result;
  }

  private JsonNode tree(HttpResponse<String> response) {
    return json.readTree(response.body());
  }

  private JsonNode ok(HttpResponse<String> response) {
    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.headers().firstValue("content-type"))
        .hasValueSatisfying(type -> assertThat(type).contains("application/json"));
    return tree(response);
  }

  private void assertError(HttpResponse<String> response, int status, String code) {
    assertThat(response.statusCode()).isEqualTo(status);
    var body = tree(response);
    assertThat(body.path("code").asString()).isEqualTo(code);
    assertThat(body.path("message").asString()).isNotBlank();
    assertThat(body.path("fieldErrors").isObject()).isTrue();
  }

  private void assertNoUnfinalizedAnswer(JsonNode body) {
    assertThat(body.toString()).doesNotContain("correctChoice", "explanation", "\"answer\"");
  }

  private Device device() {
    return new Device();
  }

  private record StudentFixture(
      Account account, Classroom classroom, Account teacher, School school) {}

  private record Mutation(String method, String path, Map<String, ?> body) {}

  private record Csrf(String header, String token) {}

  private final class Device {
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    private final HttpClient http =
        HttpClient.newBuilder()
            .cookieHandler(cookies)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private Device() {
      clients.add(http);
    }

    private HttpResponse<String> get(String path) throws Exception {
      return request("GET", path, null, null);
    }

    private Csrf csrf() throws Exception {
      var response = get("/api/auth/csrf");
      var body = ok(response);
      assertThat(response.headers().firstValue("cache-control"))
          .hasValueSatisfying(value -> assertThat(value).contains("no-store"));
      return new Csrf(body.path("headerName").asString(), body.path("token").asString());
    }

    private void loginStudent(Classroom classroom, int number) throws Exception {
      assertThat(
              ok(mutate("POST", "/api/auth/students/login", studentLogin(classroom, number)))
                  .path("role")
                  .asString())
          .isEqualTo("STUDENT");
    }

    private void loginStaff(Account staff) throws Exception {
      assertThat(
              ok(mutate(
                      "POST",
                      "/api/auth/staff/login",
                      Map.of(
                          "staffLoginId",
                          staff.getStaffLoginId(),
                          "password",
                          TestFixtures.PASSWORD)))
                  .path("role")
                  .asString())
          .isEqualTo(staff.getRole().name());
    }

    private String sessionCookie() {
      return cookies.getCookieStore().getCookies().stream()
          .filter(cookie -> cookie.getName().equals("JSESSIONID"))
          .findFirst()
          .orElseThrow()
          .getValue();
    }

    private HttpResponse<String> mutate(String method, String path, Map<String, ?> body)
        throws Exception {
      return request(method, path, body, csrf());
    }

    private HttpResponse<String> request(String method, String path, Map<String, ?> body, Csrf csrf)
        throws Exception {
      var request =
          HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
              .timeout(Duration.ofSeconds(10))
              .header("Accept", "application/json");
      if (csrf != null) request.header(csrf.header(), csrf.token());
      if (body != null) request.header("Content-Type", "application/json");
      request.method(
          method,
          body == null
              ? HttpRequest.BodyPublishers.noBody()
              : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
      return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
  }
}
