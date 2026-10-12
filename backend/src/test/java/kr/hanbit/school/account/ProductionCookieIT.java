package kr.hanbit.school.account;

import static org.assertj.core.api.Assertions.*;

import java.net.*;
import java.net.http.*;
import kr.hanbit.school.support.PostgresTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@Import(PostgresTestConfiguration.class)
class ProductionCookieIT {
  @LocalServerPort int port;

  @Test
  void productionCookieIsSecure() throws Exception {
    var response =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/csrf"))
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.headers().allValues("set-cookie"))
        .anySatisfy(cookie -> assertThat(cookie).contains("HttpOnly", "Secure", "SameSite=Lax"));
    assertThat(response.headers().firstValue("cache-control")).contains("no-store");
  }
}
