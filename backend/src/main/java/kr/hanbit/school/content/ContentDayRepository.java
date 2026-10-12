package kr.hanbit.school.content;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContentDayRepository extends JpaRepository<ContentDay, ContentDayId> {
  List<ContentDay> findByIdVersionOrderByIdDayAsc(String version);
}
