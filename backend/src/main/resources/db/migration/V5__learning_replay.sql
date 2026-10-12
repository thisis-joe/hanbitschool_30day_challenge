create unique index uq_learning_session_repeat_identity
    on learning_sessions(id, student_account_id, version, mode);

create table review_attempts (
    id uuid primary key,
    student_account_id uuid not null,
    version varchar(100) not null,
    question_id integer not null,
    session_id uuid not null,
    day_attempt_id uuid,
    mode varchar(10) not null,
    request_id uuid not null,
    choice char(1),
    timed_out boolean not null,
    correct boolean not null,
    outcome varchar(10) not null,
    answered_at timestamptz not null,
    response_millis bigint not null,
    constraint review_attempts_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint review_attempts_question_fk foreign key (version, question_id)
        references questions(version, question_id) on delete no action,
    constraint review_attempts_session_identity_fk foreign key (session_id, student_account_id, version, mode)
        references learning_sessions(id, student_account_id, version, mode) on delete no action,
    constraint review_attempts_attempt_identity_fk foreign key (day_attempt_id, session_id, student_account_id, version)
        references day_attempts(id, session_id, student_account_id, version) on delete no action,
    constraint review_attempts_session_question_fk foreign key (session_id, version, question_id)
        references learning_session_questions(session_id, version, question_id) on delete no action,
    constraint uq_review_attempt_session_question unique (session_id, version, question_id),
    constraint review_attempts_mode_check check (mode in ('REVIEW', 'REPLAY')),
    constraint review_attempts_day_attempt_mode_check check (
        (mode = 'REPLAY' and day_attempt_id is not null)
        or (mode = 'REVIEW' and day_attempt_id is null)
    ),
    constraint review_attempts_choice_check check (choice in ('O', 'X')),
    constraint review_attempts_outcome_check check (
        (outcome = 'TIMED_OUT' and timed_out and choice is null and not correct)
        or (outcome = 'CORRECT' and not timed_out and choice is not null and correct)
        or (outcome = 'WRONG' and not timed_out and choice is not null and not correct)
    ),
    constraint review_attempts_response_millis_check check (response_millis >= 0)
);
