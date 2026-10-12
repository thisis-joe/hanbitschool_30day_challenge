create unique index uq_learning_session_answer_identity
    on learning_sessions(id, student_account_id, version);

create unique index uq_day_attempt_answer_identity
    on day_attempts(id, session_id, student_account_id, version);

create table first_answers (
    id uuid primary key,
    student_account_id uuid not null,
    version varchar(100) not null,
    question_id integer not null,
    session_id uuid not null,
    day_attempt_id uuid not null,
    request_id uuid not null,
    choice char(1),
    timed_out boolean not null,
    correct boolean not null,
    answered_at timestamptz not null,
    response_millis bigint not null,
    constraint first_answers_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint first_answers_question_fk foreign key (version, question_id)
        references questions(version, question_id) on delete no action,
    constraint first_answers_session_identity_fk foreign key (session_id, student_account_id, version)
        references learning_sessions(id, student_account_id, version) on delete no action,
    constraint first_answers_attempt_identity_fk foreign key (day_attempt_id, session_id, student_account_id, version)
        references day_attempts(id, session_id, student_account_id, version) on delete no action,
    constraint uq_first_answer unique (student_account_id, version, question_id),
    constraint first_answers_choice_check check (choice in ('O', 'X')),
    constraint first_answers_timeout_choice_check check (timed_out = (choice is null)),
    constraint first_answers_timeout_correct_check check (not timed_out or not correct),
    constraint first_answers_response_millis_check check (response_millis >= 0)
);

create table last_answers (
    student_account_id uuid not null,
    version varchar(100) not null,
    question_id integer not null,
    source_type varchar(10) not null,
    source_id uuid not null,
    choice char(1),
    timed_out boolean not null,
    correct boolean not null,
    outcome varchar(10) not null,
    answered_at timestamptz not null,
    primary key (student_account_id, version, question_id),
    constraint last_answers_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint last_answers_question_fk foreign key (version, question_id)
        references questions(version, question_id) on delete no action,
    constraint last_answers_source_type_check check (source_type in ('FIRST', 'REPEAT')),
    constraint last_answers_choice_check check (choice in ('O', 'X')),
    constraint last_answers_outcome_check check (
        (outcome = 'TIMED_OUT' and timed_out and choice is null and not correct)
        or (outcome = 'CORRECT' and not timed_out and choice is not null and correct)
        or (outcome = 'WRONG' and not timed_out and choice is not null and not correct)
    )
);

create table xp_entries (
    id uuid primary key,
    student_account_id uuid not null,
    kind varchar(20) not null,
    source_id uuid not null,
    amount integer not null,
    rule_version varchar(30) not null,
    created_at timestamptz not null,
    constraint xp_entries_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint uq_xp_source unique (kind, source_id),
    constraint xp_entries_kind_check check (kind in ('FIRST_ANSWER', 'REPEAT_ANSWER', 'FIRST_DAY_PASS')),
    constraint xp_entries_amount_positive check (amount > 0),
    constraint xp_entries_rule_version_check check (rule_version = 'learning-v1')
);

create index xp_entries_student_idx on xp_entries(student_account_id);
