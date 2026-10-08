-- Deep management decisions: binding commitments, manager-specific trade-offs, and multi-stage consequences.
-- Apply after 20261008195500_fix_management_decision_bookkeeping.sql.

create table if not exists private.management_decision_commitments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  decision_id uuid not null references public.management_decisions(id) on delete cascade,
  amount numeric(18,2) not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','applied')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (decision_id)
);
create index if not exists management_decision_commitments_due_idx
  on private.management_decision_commitments(company_id,status,due_at);

-- This trigger captures a commitment exactly once when a choice is finalized.
-- Delayed amounts are frozen at decision time: no recalculation with future company value.
create or replace function private.queue_management_decision_commitment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_option jsonb;
  v_pct numeric;
  v_value numeric;
  v_followup text;
  v_delay numeric;
begin
  if old.status='resolved' or new.status<>'resolved' or new.chosen_option_key is null then
    return new;
  end if;
  select value into v_option
  from jsonb_array_elements(new.options) where value->>'key'=new.chosen_option_key limit 1;
  if v_option is null then return new; end if;

  v_delay:=greatest(1,least(2160,coalesce((v_option->>'commitment_delay_hours')::numeric,168)));
  v_pct:=coalesce((v_option->>'commitment_cash_pct_value')::numeric,0);
  if v_pct<>0 then
    select company_value into v_value from public.companies where id=new.company_id;
    insert into private.management_decision_commitments(company_id,decision_id,amount,due_at)
    values(new.company_id,new.id,round(coalesce(v_value,0)*v_pct,2),now()+v_delay*interval '1 hour')
    on conflict(decision_id) do nothing;
  end if;

  -- Unlike chance-based follow-ups this chain always develops after the chosen action.
  v_followup:=nullif(v_option->>'guaranteed_followup','');
  if v_followup is not null and exists(
    select 1 from private.management_decision_templates
    where template_key=v_followup and enabled=true
  ) then
    insert into private.management_decision_followups(company_id,parent_decision_id,template_key,due_at)
    values(new.company_id,new.id,v_followup,now()+v_delay*interval '1 hour');
  end if;
  return new;
end $$;

drop trigger if exists trg_queue_management_decision_commitment on public.management_decisions;
create trigger trg_queue_management_decision_commitment
after update of status on public.management_decisions
for each row execute function private.queue_management_decision_commitment();

-- Idempotent settlement: row locks protect against concurrent visits or workers.
create or replace function private.settle_due_management_commitments(p_company_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
  v_item private.management_decision_commitments%rowtype;
  v_title text;
begin
  for v_item in
    select * from private.management_decision_commitments
    where company_id=p_company_id and status='pending' and due_at<=now()
    order by due_at,id for update skip locked
  loop
    select title into v_title from public.management_decisions where id=v_item.decision_id;
    if v_item.amount<>0 then
      update public.companies
      set cash_balance=cash_balance+v_item.amount,updated_at=now()
      where id=p_company_id;
      insert into public.financial_transactions(
        company_id,transaction_type,amount,description,reference_type,reference_id,cost_center
      ) values (
        p_company_id,
        case when v_item.amount>0 then 'management_decision_financing' else 'management_decision_cost' end,
        v_item.amount,
        'Spätfolge der Managemententscheidung: '||coalesce(v_title,'Unbekannt'),
        'management_decision',v_item.decision_id,'management'
      );
    end if;
    update private.management_decision_commitments
    set status='applied',applied_at=now() where id=v_item.id;
  end loop;
end $$;

-- Settle during the normal management processing cycle, not in the read-only
-- decision-center RPC introduced in 0.10.281.
do $patch$
declare v_def text;
begin
  select pg_get_functiondef('private.process_management_company(uuid)'::regprocedure) into v_def;
  if position('private.settle_due_management_commitments(p_company_id)' in v_def)=0 then
    if position('perform private.complete_due_manager_states(p_company_id);' in v_def)=0 then
      raise exception 'Unexpected management processing function; cannot safely attach commitments';
    end if;
    v_def:=replace(v_def,
      'perform private.complete_due_manager_states(p_company_id);',
      'perform private.settle_due_management_commitments(p_company_id);'
      ||chr(10)||'  perform private.complete_due_manager_states(p_company_id);');
    execute v_def;
  end if;
end $patch$;

-- Follow-up choices preserve existing 24h expiry, real effect engine and manager advice.
insert into private.management_decision_templates (
  template_key,decision_level,severity,title,description,conditions,context_keys,options,
  manager_prompts,default_option_key,cooldown_hours,expires_hours,weight,trigger_enabled,enabled
) values
(
 'key_manager_retention','tactical','important','Schlüsselmanager vor dem Absprung',
 'Eine zentrale Führungskraft verlangt einen Perspektivwechsel. Bindung schützt Wissen, kostet aber Flexibilität.',
 '[]'::jsonb,ARRAY['cash_balance','profit_margin','min_manager_motivation'],
 $json$[
 {"key":"retain","label":"Bindungsprogramm zusagen","summary":"Die Führungskraft halten, dafür zukünftige Vergütung schulden.","view":"management","impact":"Motivation steigt sofort; eine verbindliche Auszahlung folgt in 14 Tagen.","effects":{"motivation":[{"role":"production","delta":14}],"cash_pct_value":-0.002},"commitment_cash_pct_value":-0.008,"commitment_delay_hours":336,"style":{"people":6,"discipline":-2}},
 {"key":"restructure","label":"Verantwortung neu verteilen","summary":"Team stärken, aber Führungskonflikte riskieren.","view":"management","impact":"Mehrere Manager gewinnen Verantwortung; nach 7 Tagen wird die Übergabe geprüft.","effects":{"motivation":[{"role":"production","delta":-8},{"role":"finance","delta":5},{"role":"logistics","delta":5}]},"guaranteed_followup":"leadership_handover_review","commitment_delay_hours":168,"style":{"people":2,"risk":4}},
 {"key":"hold_line","label":"Keine Sonderkonditionen","summary":"Finanzdisziplin vor Personalbindung.","view":"finance","impact":"Kein Geldabfluss, aber sinkende Motivation und Leistungssicherheit.","effects":{"motivation":[{"role":"production","delta":-18}],"reputation_delta":-2},"style":{"discipline":5,"cost":4,"people":-5}}
 ]$json$::jsonb,
 '{"production":"Eine erzwungene Neuaufstellung gefährdet Produktionsroutine.","finance":"Eine Zusage schafft langfristige Fixkosten; wir brauchen einen messbaren Nutzen."}'::jsonb,
 'restructure',240,24,0.22,true,true
),
(
 'capacity_investment_board','strategic','important','Kapazitätsentscheidung mit Folgekosten',
 'Ein Kapazitätsfenster eröffnet Chancen. Die falsche Entscheidung kann die Liquidität erst Wochen später treffen.',
 '[]'::jsonb,ARRAY['prod_util','cash_balance','cashflow','company_value_growth_7d'],
 $json$[
 {"key":"accelerate","label":"Kapazität offensiv ausbauen","summary":"Mehr Produktion, spätere Investitionsrate und unsichere Nachfrage.","view":"production","impact":"Produktion steigt kurzfristig; eine zweite Investitionsrate wird nach 21 Tagen fällig.","effects":{"cash_pct_value":-0.012,"temporary":[{"key":"production_output","min":0.08,"max":0.12,"hours":504}]},"commitment_cash_pct_value":-0.024,"commitment_delay_hours":504,"guaranteed_followup":"investment_payback_review","style":{"growth":7,"risk":6}},
 {"key":"outsource","label":"Spitzen extern abfedern","summary":"Bilanz schonen, variable Stückkosten akzeptieren.","view":"purchasing","impact":"Geringeres Investitionsrisiko bei höheren Produktionskosten für zwei Wochen.","effects":{"temporary":[{"key":"production_cost","min":0.05,"max":0.09,"hours":336},{"key":"production_output","min":0.03,"max":0.06,"hours":336}]},"style":{"discipline":3,"growth":2}},
 {"key":"defer","label":"Investition verschieben","summary":"Liquidität sichern, Wachstum aufgeben.","view":"finance","impact":"Kein Sofortabfluss; Absatzchancen und Reputation können leiden.","effects":{"reputation_delta":-2},"style":{"discipline":5,"growth":-5,"risk":-3}}
 ]$json$::jsonb,
 '{"production":"Unsere vorhandenen Anlagen müssen den Wachstumspfad tragen können.","finance":"Die zweite Rate darf nicht aus der Planung fallen."}'::jsonb,
 'outsource',336,24,0.15,true,true
),
(
 'leadership_handover_review','tactical','important','Übergabe unter Druck',
 'Die Umverteilung der Führung hat Spannungen ausgelöst. Wer trägt jetzt die Verantwortung?',
 '[]'::jsonb,ARRAY['min_manager_motivation','profit_margin'],
 $json$[
 {"key":"coach","label":"Übergabe aktiv begleiten","summary":"Zusätzlicher Führungsaufwand für Teambindung.","view":"management","impact":"Einmalige Kosten, Motivation der betroffenen Bereiche steigt.","effects":{"cash_pct_value":-0.003,"motivation":[{"role":"production","delta":9},{"role":"finance","delta":5}]},"style":{"people":4}},
 {"key":"authority","label":"Klare Einzelverantwortung setzen","summary":"Schnelle Entscheidungen vor Konsens.","view":"management","impact":"Verwaltung profitiert, Produktion verliert Motivation.","effects":{"motivation":[{"role":"finance","delta":8},{"role":"production","delta":-8}]},"style":{"discipline":4,"people":-3}},
 {"key":"freeze","label":"Organisationsänderung stoppen","summary":"Stabilität zurückholen und Reibungsverluste akzeptieren.","view":"production","impact":"Motivation der Produktion steigt, aber Effizienz sinkt temporär.","effects":{"motivation":[{"role":"production","delta":6}],"temporary":[{"key":"production_output","min":-0.06,"max":-0.03,"hours":120}]},"style":{"risk":-3}}
 ]$json$::jsonb,
 '{"production":"Ohne klare Verantwortung verlieren wir Leistung.","finance":"Die neue Struktur braucht überprüfbare Ziele."}'::jsonb,
 'coach',168,24,1,false,true
),
(
 'investment_payback_review','strategic','important','Investitionskontrolle nach drei Wochen',
 'Die zweite Investitionsrate ist abgeflossen. Jetzt müssen Wachstum und finanzielle Widerstandskraft neu abgewogen werden.',
 '[]'::jsonb,ARRAY['profit_margin','cashflow','cash_runway','prod_util'],
 $json$[
 {"key":"optimize","label":"Auslastung priorisieren","summary":"Rendite der Investition absichern.","view":"production","impact":"Effizienz steigt, aber Wachstumsreserven bleiben begrenzt.","effects":{"temporary":[{"key":"production_cost","min":-0.08,"max":-0.04,"hours":336}]},"style":{"discipline":5}},
 {"key":"commercialize","label":"Absatz mit Nachdruck entwickeln","summary":"Zusätzlichen Vertriebserfolg suchen.","view":"market","impact":"Handelsvolumen steigt, Erlös pro Einheit fällt.","effects":{"temporary":[{"key":"retail_rate","min":0.06,"max":0.11,"hours":336},{"key":"retail_revenue","min":-0.04,"max":-0.02,"hours":336}]},"style":{"growth":5,"risk":2}},
 {"key":"protect","label":"Liquidität konsequent schützen","summary":"Wachstum drosseln, Reserven wiederaufbauen.","view":"finance","impact":"Betriebskosten sinken, Produktionsleistung fällt.","effects":{"temporary":[{"key":"production_cost","min":-0.06,"max":-0.03,"hours":336},{"key":"production_output","min":-0.06,"max":-0.03,"hours":336}]},"style":{"discipline":6,"growth":-4}}
 ]$json$::jsonb,
 '{"finance":"Kapitalbindung muss sich auch in Cashflow übersetzen.","sales":"Mehr Kapazität ist nur mit belastbarer Nachfrage wertvoll."}'::jsonb,
 'optimize',336,24,1,false,true
)
on conflict(template_key) do update set
 decision_level=excluded.decision_level,severity=excluded.severity,title=excluded.title,
 description=excluded.description,conditions=excluded.conditions,context_keys=excluded.context_keys,
 options=excluded.options,manager_prompts=excluded.manager_prompts,default_option_key=excluded.default_option_key,
 cooldown_hours=excluded.cooldown_hours,expires_hours=excluded.expires_hours,weight=excluded.weight,
 trigger_enabled=excluded.trigger_enabled,enabled=excluded.enabled,updated_at=now();

-- Snapshot the actual manager affected by a retention decision.
-- Apply motivation to the chosen person, not the replacement who might later hold the role.
create or replace function private.bind_management_decision_manager()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_manager public.company_managers%rowtype;
        v_options jsonb:='[]'::jsonb;
        v_option jsonb;
        v_motivation jsonb;
        v_entry jsonb;
        v_new_motivation jsonb;
begin
  if new.template_key<>'key_manager_retention' then return new; end if;
  select * into v_manager
  from public.company_managers
  where company_id=new.company_id and role='production' and status='active'
  order by id limit 1;
  if v_manager.id is null then return new; end if;
  new.context:=coalesce(new.context,'{}'::jsonb) || jsonb_build_object(
    'affected_manager',v_manager.manager_name,
    'affected_manager_id',v_manager.id,
    'affected_manager_motivation',v_manager.motivation
  );
  for v_option in select value from jsonb_array_elements(new.options) loop
    v_new_motivation:='[]'::jsonb;
    v_motivation:=coalesce(v_option#>'{effects,motivation}','[]'::jsonb);
    for v_entry in select value from jsonb_array_elements(v_motivation) loop
      if v_entry->>'role'='production' then
        v_entry:=v_entry || jsonb_build_object('manager_id',v_manager.id);
      end if;
      v_new_motivation:=v_new_motivation||jsonb_build_array(v_entry);
    end loop;
    if jsonb_array_length(v_motivation)>0 then
      v_option:=jsonb_set(v_option,'{effects,motivation}',v_new_motivation);
    end if;
    v_options:=v_options||jsonb_build_array(v_option);
  end loop;
  new.options:=v_options;
  return new;
end $$;

drop trigger if exists trg_bind_management_decision_manager on public.management_decisions;
create trigger trg_bind_management_decision_manager
before insert on public.management_decisions
for each row execute function private.bind_management_decision_manager();

-- The existing option engine accepts manager_id when supplied, keeping old
-- role-wide motivations unchanged for all existing decision templates.
do $patch$
declare v_def text;
        v_old text:='and ((m->>''role'')=''all'' or role=(m->>''role''));';
        v_new text:='and (case when m ? ''manager_id'' then id=(m->>''manager_id'')::uuid else ((m->>''role'')=''all'' or role=(m->>''role'')) end);';
begin
  select pg_get_functiondef('private.apply_management_option(uuid,uuid,text,boolean)'::regprocedure) into v_def;
  if position(v_new in v_def)=0 then
    if position(v_old in v_def)=0 then
      raise exception 'Unknown motivation update structure in apply_management_option';
    end if;
    execute replace(v_def,v_old,v_new);
  end if;
end $patch$;
