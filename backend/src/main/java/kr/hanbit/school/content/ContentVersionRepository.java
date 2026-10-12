package kr.hanbit.school.content;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContentVersionRepository extends JpaRepository<ContentVersion, String> {
  Optional<ContentVersion> findByActiveTrue();
}
