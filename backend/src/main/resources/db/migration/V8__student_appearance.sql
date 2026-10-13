create table student_appearances (
    student_account_id uuid primary key,
    character_id varchar(20),
    revision bigint not null,
    updated_at timestamptz not null,
    constraint student_appearances_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint student_appearances_revision_check check (revision >= 0),
    constraint student_appearances_character_check check (
        character_id is null or character_id in ('haru','naru','sodam','iden','arin','rumi','onyu','bora','sion')
    )
);

create table student_equipment (
    student_account_id uuid not null,
    slot varchar(20) not null,
    item_id varchar(30),
    primary key (student_account_id, slot),
    constraint student_equipment_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint student_equipment_slot_check check (slot in ('face','hat','top','bottom','shoes','hand')),
    constraint student_equipment_item_check check (item_id is null or item_id ~ ('^' || slot || '-[1-5]$'))
);
