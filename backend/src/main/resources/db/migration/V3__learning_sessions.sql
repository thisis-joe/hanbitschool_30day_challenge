create table day_progress (
    id uuid primary key,
    student_account_id uuid not null,
    version varchar(100) not null,
    day integer not null,
    state varchar(20) not null,
    passed_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    constraint day_progress_student_fk foreign key (student_account_id) references accounts(id) on delete no action,
    constraint day_progress_version_fk foreign key (version) references content_versions(version) on delete no action,
    constraint uq_day_progress_identity unique (id, student_account_id, version, day),
    constraint uq_day_progress_student_version_day unique (student_account_id, version, day),
    constraint day_progress_day_range check (day between 1 and 30),
    constraint day_progress_state_check check (state in ('NOT_STARTED', 'IN_PROGRESS', 'RETRY_REQUIRED', 'PASSED')),
    constraint day_progress_passed_at_check check ((state = 'PASSED') = (passed_at is not null))
);

create table learning_sessions (
    id uuid primary key,
    student_account_id uuid not null,
    version varchar(100) not null,
    mode varchar(10) not null,
    day integer,
    state varchar(20) not null,
    current_position integer not null,
    deadline_at timestamptz not null,
    last_result_json jsonb,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    constraint learning_sessions_student_fk foreign key (student_account_id) references accounts(id) on delete no action,
    constraint learning_sessions_version_fk foreign key (version) references content_versions(version) on delete no action,
    constraint uq_learning_session_identity unique (id, student_account_id, version, day),
    constraint learning_sessions_mode_check check (mode in ('FIRST', 'REVIEW', 'REPLAY')),
    constraint learning_sessions_day_mode_check check (
        (mode = 'REVIEW' and day is null)
        or (mode in ('FIRST', 'REPLAY') and day between 1 and 30)
    ),
    constraint learning_sessions_state_check check (state in ('QUESTION_ACTIVE', 'AWAITING_ADVANCE', 'COMPLETED')),
    constraint learning_sessions_position_range check (current_position between 1 and 150)
);

create unique index uq_learning_session_active_student
    on learning_sessions(student_account_id)
    where state <> 'COMPLETED';

create index learning_sessions_expiry_idx
    on learning_sessions(deadline_at, id)
    where state = 'QUESTION_ACTIVE';

create table learning_session_questions (
    session_id uuid not null,
    position integer not null,
    version varchar(100) not null,
    question_id integer not null,
    primary key (session_id, position),
    constraint learning_session_questions_session_fk foreign key (session_id) references learning_sessions(id) on delete no action,
    constraint learning_session_questions_question_fk foreign key (version, question_id) references questions(version, question_id) on delete no action,
    constraint uq_learning_session_question unique (session_id, version, question_id),
    constraint learning_session_questions_position_range check (position between 1 and 150)
);

create table day_attempts (
    id uuid primary key,
    session_id uuid not null,
    day_progress_id uuid not null,
    student_account_id uuid not null,
    version varchar(100) not null,
    day integer not null,
    attempt_number integer not null,
    state varchar(20) not null,
    answered_count integer not null,
    correct_count integer not null,
    current_streak integer not null,
    catch_up boolean not null,
    started_at timestamptz not null,
    finished_at timestamptz,
    constraint day_attempts_session_unique unique (session_id),
    constraint day_attempts_session_fk foreign key (session_id) references learning_sessions(id) on delete no action,
    constraint day_attempts_session_identity_fk foreign key (session_id, student_account_id, version, day)
        references learning_sessions(id, student_account_id, version, day) on delete no action,
    constraint day_attempts_progress_fk foreign key (day_progress_id) references day_progress(id) on delete no action,
    constraint day_attempts_progress_identity_fk foreign key (day_progress_id, student_account_id, version, day)
        references day_progress(id, student_account_id, version, day) on delete no action,
    constraint day_attempts_student_fk foreign key (student_account_id) references accounts(id) on delete no action,
    constraint day_attempts_day_fk foreign key (version, day) references content_days(version, day) on delete no action,
    constraint uq_day_attempt_number unique (student_account_id, version, day, attempt_number),
    constraint day_attempts_day_range check (day between 1 and 30),
    constraint day_attempts_number_positive check (attempt_number > 0),
    constraint day_attempts_state_check check (state in ('ACTIVE', 'PASSED', 'RETRY_REQUIRED')),
    constraint day_attempts_counts_check check (
        answered_count between 0 and 5
        and correct_count between 0 and answered_count
        and current_streak between 0 and correct_count
    ),
    constraint day_attempts_finished_at_check check ((state = 'ACTIVE') = (finished_at is null)),
    constraint day_attempts_terminal_count_check check (state = 'ACTIVE' or answered_count = 5)
);

create table idempotency_records (
    student_account_id uuid not null,
    operation varchar(20) not null,
    request_id uuid not null,
    payload_hash char(64) not null,
    response_json jsonb not null,
    created_at timestamptz not null,
    primary key (student_account_id, operation, request_id),
    constraint idempotency_records_student_fk foreign key (student_account_id) references accounts(id) on delete no action,
    constraint idempotency_records_operation_check check (operation in ('START_SESSION', 'SUBMIT_ANSWER', 'ADVANCE_SESSION')),
    constraint idempotency_records_payload_hash_check check (payload_hash ~ '^[0-9a-f]{64}$')
);
