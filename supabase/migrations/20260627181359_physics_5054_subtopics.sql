insert into public.topic_maps(subject_code,topic,subtopic,keywords,status,source) values
('5054','Motion','Speed and acceleration',array['speed','velocity','acceleration','distance time','velocity time','deceleration'],'approved','manual'),
('5054','Forces','Newton''s laws',array['newton','resultant force','force mass acceleration','inertia'],'approved','manual'),
('5054','Forces','Weight and mass',array['weight','mass','gravitational field strength','centre of mass'],'approved','manual'),
('5054','Forces','Moments',array['moment','turning effect','pivot','couple','equilibrium'],'approved','manual'),
('5054','Forces','Pressure',array['pressure','force per unit area','pascal','hydraulic'],'approved','manual'),
('5054','Forces','Friction',array['friction','drag','air resistance','resistive force'],'approved','manual'),
('5054','Energy','Energy stores and transfers',array['kinetic energy','potential energy','energy transfer','conservation of energy'],'approved','manual'),
('5054','Energy','Work and power',array['work done','power','joule','watt'],'approved','manual'),
('5054','Energy','Efficiency',array['efficiency','useful energy','wasted energy'],'approved','manual'),
('5054','Matter','Particle model',array['particle','solid','liquid','gas','brownian motion','molecule'],'approved','manual'),
('5054','Matter','Density',array['density','mass per unit volume','displacement method'],'approved','manual'),
('5054','Thermal Physics','Temperature',array['temperature','thermometer','thermal equilibrium'],'approved','manual'),
('5054','Thermal Physics','Heat transfer',array['heat transfer','thermal energy','energy transfer by heating'],'approved','manual'),
('5054','Thermal Physics','Conduction',array['conduction','conductor','insulator','free electron'],'approved','manual'),
('5054','Thermal Physics','Convection',array['convection','convection current','hot fluid rises'],'approved','manual'),
('5054','Thermal Physics','Radiation',array['infrared radiation','thermal radiation','black surface','emitter'],'approved','manual'),
('5054','Thermal Physics','Specific heat capacity',array['specific heat capacity','thermal capacity','temperature rise'],'approved','manual'),
('5054','Thermal Physics','Change of state',array['melting','boiling','evaporation','latent heat','change of state'],'approved','manual'),
('5054','Waves','Wave properties',array['wave','amplitude','wavefront','diffraction'],'approved','manual'),
('5054','Waves','Transverse waves',array['transverse wave','perpendicular oscillation'],'approved','manual'),
('5054','Waves','Longitudinal waves',array['longitudinal wave','compression','rarefaction'],'approved','manual'),
('5054','Waves','Frequency and wavelength',array['frequency','wavelength','hertz'],'approved','manual'),
('5054','Waves','Wave speed',array['wave speed','frequency wavelength','speed of wave'],'approved','manual'),
('5054','Sound','Sound waves',array['sound','ultrasound','echo','pitch','loudness','microphone'],'approved','manual'),
('5054','Light','Reflection',array['reflection','law of reflection','incident ray','reflected ray','mirror'],'approved','manual'),
('5054','Light','Refraction',array['refraction','refractive index','bending of light'],'approved','manual'),
('5054','Light','Lenses',array['lens','focal length','principal focus','converging lens','diverging lens'],'approved','manual'),
('5054','Light','Ray diagrams',array['ray diagram','image','real image','virtual image','magnification'],'approved','manual'),
('5054','Light','Critical angle',array['critical angle','refractive index'],'approved','manual'),
('5054','Light','Total internal reflection',array['total internal reflection','optical fibre'],'approved','manual'),
('5054','Light','Dispersion',array['dispersion','prism','spectrum','white light'],'approved','manual'),
('5054','Electricity','Current and charge',array['current','charge','electron flow','coulomb','ammeter'],'approved','manual'),
('5054','Electricity','Potential difference',array['potential difference','voltage','voltmeter','electromotive force'],'approved','manual'),
('5054','Electricity','Resistance',array['resistance','ohm','resistor','current voltage graph'],'approved','manual'),
('5054','Electricity','Series circuits',array['series circuit','resistors in series'],'approved','manual'),
('5054','Electricity','Parallel circuits',array['parallel circuit','resistors in parallel'],'approved','manual'),
('5054','Electricity','Electrical power',array['electrical power','electrical energy','kilowatt hour','fuse'],'approved','manual'),
('5054','Electricity','Circuit components',array['circuit component','thermistor','light dependent resistor','diode','relay'],'approved','manual'),
('5054','Atomic Physics','Radioactivity',array['radioactive','radioactivity','background radiation','decay'],'approved','manual'),
('5054','Atomic Physics','Alpha beta gamma',array['alpha','beta','gamma','ionising radiation','penetrating power'],'approved','manual'),
('5054','Atomic Physics','Half-life',array['half life','decay curve','activity falls'],'approved','manual'),
('5054','Atomic Physics','Isotopes',array['isotope','proton number','nucleon number'],'approved','manual'),
('5054','Atomic Physics','Nuclear structure',array['nucleus','proton','neutron','nuclear structure'],'approved','manual'),
('5054','Magnetism','Magnetic fields',array['magnetic field','bar magnet','field line','compass'],'approved','manual'),
('5054','Electromagnetism','Electromagnetic induction',array['electromagnetic induction','induced emf','generator','transformer'],'approved','manual'),
('5054','Electromagnetism','Motor effect',array['motor effect','force on current','electric motor','solenoid'],'approved','manual'),
('5054','Space Physics','Stars and galaxies',array['star','galaxy','redshift','universe','stellar evolution'],'approved','manual'),
('5054','Space Physics','Orbits and satellites',array['orbit','satellite','planet','solar system','gravitational orbit'],'approved','manual')
on conflict(subject_code,topic,subtopic) do update
set keywords=excluded.keywords,status='approved',source='manual',updated_at=now();

create or replace function public.bulk_update_question_topics(p_updates jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare affected integer;
begin
  update public.question_index qi
  set topic = u.topic,
      subtopic = u.subtopic,
      confidence = u.confidence,
      difficulty = u.difficulty,
      syllabus_reference = u.syllabus_reference,
      needs_review = u.needs_review,
      tagging_method = u.tagging_method,
      tagging_note = u.tagging_note,
      updated_at = now()
  from jsonb_to_recordset(p_updates) as u(
    id bigint, topic text, subtopic text, confidence numeric,
    difficulty text, syllabus_reference text, needs_review boolean,
    tagging_method text, tagging_note text
  )
  where qi.id = u.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.bulk_update_question_topics(jsonb) from public, anon;
grant execute on function public.bulk_update_question_topics(jsonb) to authenticated;
