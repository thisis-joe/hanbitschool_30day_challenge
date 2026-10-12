package kr.hanbit.school.security;

import jakarta.servlet.http.*;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.*;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.*;
import org.springframework.stereotype.Component;

@Component
public class SessionLoginHandler {
  private final HttpSessionSecurityContextRepository repository;
  private final SessionAuthenticationStrategy strategy;

  public SessionLoginHandler(HttpSessionSecurityContextRepository r, CsrfTokenRepository csrf) {
    repository = r;
    strategy =
        new CompositeSessionAuthenticationStrategy(
            List.of(
                new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrf)));
  }

  public void establish(
      AccountPrincipal p, HttpServletRequest request, HttpServletResponse response) {
    var auth =
        UsernamePasswordAuthenticationToken.authenticated(
            p, null, List.of(new SimpleGrantedAuthority("ROLE_" + p.role().name())));
    strategy.onAuthentication(auth, request, response);
    var context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(auth);
    SecurityContextHolder.setContext(context);
    repository.saveContext(context, request, response);
  }
}
