package kr.hanbit.school.game;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentAppearanceRepository extends JpaRepository<StudentAppearance, UUID> {}
