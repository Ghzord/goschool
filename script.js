'use strict';

const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'goevent.school.v1';
const SESSION_KEY = 'goevent.session.v1';
const PARTNER_SCHOOLS = [{ id: 'fortec', name: 'Fortec' }];
// Demo credentials only. Real authentication and school authorization require a server.
const ORGANIZER_ACCOUNT = { email: 'fortec@gmail.com', password: 'fortec', schoolId: 'fortec' };
const categoryStyle = { Ciência: 'ciencia', Natureza: 'natureza', Cultura: 'cultura', Tecnologia: 'tecnologia', Palestras: 'palestras', Esportes: 'esportes' };
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const uid = () => globalThis.crypto?.randomUUID?.() || `go-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const schoolName = id => PARTNER_SCHOOLS.find(school => school.id === id)?.name || 'Outra escola';
const normalizeEmail = email => email.trim().toLowerCase();
const isPartnerSchool = id => PARTNER_SCHOOLS.some(school => school.id === id);

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function seed() {
  return {
    schemaVersion: 3,
    students: [],
    events: [
      { id: 'trip-science', schoolId: 'fortec', title: 'Visita ao museu de ciência', category: 'Ciência', date: futureDate(5), time: '08:00', location: 'Museu de ciência · saída pela portaria', description: 'Uma manhã de experimentos e descobertas com a turma. Leve água e venha com o uniforme da escola.', capacity: 40, registrations: [], demo: true },
      { id: 'trip-culture', schoolId: 'fortec', title: 'Arte fora da sala de aula', category: 'Cultura', date: futureDate(12), time: '08:30', location: 'Museu de arte · saída pela portaria', description: 'Visita guiada às exposições e uma atividade com o professor de arte. Separe seu caderno de anotações.', capacity: 35, registrations: [], demo: true },
      { id: 'trip-nature', schoolId: 'fortec', title: 'Dia no jardim botânico', category: 'Natureza', date: futureDate(20), time: '07:30', location: 'Jardim botânico · saída pela portaria', description: 'Uma saída para conhecer a vegetação e observar a natureza. Use tênis e leve seu lanche.', capacity: 30, registrations: [], demo: true }
    ]
  };
}

function migrateState(value) {
  if (!value || !Array.isArray(value.events)) return value;
  if (value.schemaVersion === 3) return value;
  // Keep user-created events and every existing registration when updating the examples.
  const untouchedExamples = {
    tech: ['Feira de Tecnologia', 'Tecnologia', 'Laboratório de informática', 'Robótica, programação e projetos dos alunos. Venha conhecer o que as turmas estão construindo.', 40, 7, '09:00'],
    talk: ['Profissões do futuro', 'Palestras', 'Auditório da escola', 'Uma conversa sobre faculdade, primeiro emprego e as possibilidades depois do ensino médio.', 60, 10, '14:00'],
    sports: ['Campeonato de Futsal', 'Esportes', 'Quadra poliesportiva', 'O interclasse está chegando. Faça sua inscrição e participe do campeonato com a sua turma.', 20, 14, '10:00']
  };
  const retained = value.events.filter(event => {
    const sample = untouchedExamples[event.id];
    return !(sample && (!event.schoolId || event.schoolId === 'fortec') && event.registrations?.length === 0 &&
      event.title === sample[0] && event.category === sample[1] && event.location === sample[2] &&
      event.description === sample[3] && event.capacity === sample[4] && event.date === futureDate(sample[5]) && event.time === sample[6]);
  });
  const examples = seed().events.filter(example => !retained.some(event => event.id === example.id));
  return {
    schemaVersion: 3,
    students: Array.isArray(value.students) ? value.students : [],
    events: retained.map(event => ({
      ...event,
      schoolId: event.schoolId || 'fortec',
      registrations: Array.isArray(event.registrations) ? event.registrations.map(registration => ({
        ...registration,
        studentId: registration.studentId || null,
        schoolId: registration.schoolId || event.schoolId || 'fortec',
        phone: registration.phone || ''
      })) : event.registrations
    })).concat(examples)
  };
}

function isValidState(value) {
  if (!value || value.schemaVersion !== 3 || !Array.isArray(value.events) || !Array.isArray(value.students)) return false;
  const strings = (object, keys) => keys.every(key => typeof object[key] === 'string');
  return value.students.every(student => student && strings(student, ['id', 'name', 'email', 'phone', 'schoolId']) &&
    ((!student.passwordHash && !student.passwordSalt) || hasCredentials(student))) &&
    value.events.every(event => event && strings(event, ['id', 'schoolId', 'title', 'location', 'description']) &&
      Object.hasOwn(categoryStyle, event.category) && /^\d{4}-\d{2}-\d{2}$/.test(event.date) && /^\d{2}:\d{2}$/.test(event.time) &&
      Number.isInteger(event.capacity) && event.capacity > 0 && Array.isArray(event.registrations) && event.registrations.length <= event.capacity &&
      event.registrations.every(registration => registration && strings(registration, ['name', 'email', 'phone', 'schoolId', 'classroom', 'createdAt']) &&
        (registration.studentId === null || typeof registration.studentId === 'string')));
}

let state;
let storageWarning = false;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  const raw = saved ? JSON.parse(saved) : null;
  state = raw ? migrateState(raw) : seed();
  if (!isValidState(state)) throw new Error('Dados inválidos');
  if (raw && raw.schemaVersion !== 3) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { storageWarning = true; }
  }
} catch {
  state = seed();
  storageWarning = true;
}

let session = { studentId: null, organizer: null };
// Each new opening, including refresh, starts at student login.
try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Use the in-memory session. */ }

let category = 'Todos';
let currentView = 'student-login';
let activeEvent = null;
let pendingEventId = null;
let selectedEvent = null;
let editingEventId = null;
let editingStudentId = null;
let pendingRegistrationRemoval = null;
let toastTimer;

function getStudent() {
  return state.students.find(student => student.id === session.studentId && isPartnerSchool(student.schoolId) && hasCredentials(student)) || null;
}

function getOrganizer() {
  return session.organizer?.email === ORGANIZER_ACCOUNT.email && session.organizer.schoolId === ORGANIZER_ACCOUNT.schoolId ? session.organizer : null;
}

function agendaSchoolId() { return getStudent()?.schoolId || getOrganizer()?.schoolId || null; }
function schoolEvents(schoolId) { return state.events.filter(event => event.schoolId === schoolId); }
function managedEvent(id) {
  const organizer = getOrganizer();
  return organizer ? state.events.find(event => event.id === id && event.schoolId === organizer.schoolId) || null : null;
}
function isRegistered(event, student = getStudent()) {
  return Boolean(student && event.registrations.some(registration => registration.studentId === student.id || registration.email === student.email));
}

// This identity is stable if the list order changes while confirmation is open.
function registrationKey(registration) {
  return JSON.stringify([registration.studentId, registration.email, registration.createdAt]);
}

function hasCredentials(student) {
  return Boolean(student && /^[a-f0-9]{64}$/.test(student.passwordHash) && /^[a-f0-9]{32}$/.test(student.passwordSalt));
}

async function passwordDigest(password, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto unavailable');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = Uint8Array.from(salt.match(/../g), pair => parseInt(pair, 16));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 120000 }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function createCredentials(password) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const passwordSalt = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return { passwordSalt, passwordHash: await passwordDigest(password, passwordSalt) };
}

function saveSession() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  catch { notify('A sessão ficará ativa enquanto esta página estiver aberta.'); }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6000);
}

function persist(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state = next;
    return true;
  } catch {
    notify('Não foi possível salvar. Verifique o espaço ou a permissão de armazenamento do navegador.');
    return false;
  }
}

function refreshStoredState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const latest = migrateState(JSON.parse(saved));
      if (isValidState(latest)) state = latest;
    }
  } catch { /* Keep the valid current data if the stored copy cannot be read. */ }
}

const dateText = date => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`)).replace('.', '');
const dateParts = date => ({ day: date.slice(8), month: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${date}T12:00:00`)).replace('.', '') });
function hasEnded(event) { return new Date(`${event.date}T${event.time}:00`).getTime() <= Date.now(); }

function phoneDigits(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
}
function isValidPhone(value) { return /^[+\d()\s-]+$/.test(value) && /^\d{10,11}$/.test(phoneDigits(value)); }
function formatPhone(value) {
  const digits = phoneDigits(value);
  return `(${digits.slice(0, 2)}) ${digits.slice(2, -4)}-${digits.slice(-4)}`;
}

function renderFeatured(events) {
  const event = events.find(item => !hasEnded(item) && item.registrations.length < item.capacity && !isRegistered(item));
  if (!event) {
    const hasUpcoming = events.some(item => !hasEnded(item));
    $('#featured-event').innerHTML = `<div class="feature-empty"><span class="eyebrow">PRÓXIMOS EVENTOS</span><h2>${hasUpcoming ? 'Confira suas inscrições na agenda.' : 'A agenda está sendo preparada.'}</h2><p>Os eventos e a disponibilidade de vagas aparecem na lista abaixo.</p></div>`;
    return;
  }
  const seats = event.capacity - event.registrations.length;
  $('#featured-event').innerHTML = `<article class="feature"><div class="feature-info"><span class="feature-kicker">PRÓXIMO NA AGENDA · ${escapeHTML(schoolName(event.schoolId))}</span><h2>${escapeHTML(event.title)}</h2><p class="feature-meta">${icon('calendar')}${escapeHTML(dateText(event.date))} <span>·</span> ${escapeHTML(event.time)}</p><p class="feature-location">${escapeHTML(event.location)}</p><button class="feature-button" data-register="${escapeHTML(event.id)}">Garantir minha vaga${icon('arrow')}</button></div><div class="feature-poster" aria-hidden="true"><img src="assets/${categoryStyle[event.category]}-poster.svg" alt="" width="400" height="520"></div><span class="feature-seats">${seats} ${seats === 1 ? 'vaga disponível' : 'vagas disponíveis'}</span></article>`;
}

function renderAdmin() {
  const organizer = getOrganizer();
  const events = organizer ? schoolEvents(organizer.schoolId).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)) : [];
  $('#admin-school-name').textContent = organizer ? schoolName(organizer.schoolId).toUpperCase() : '';
  $('#admin-school-badge').textContent = organizer ? schoolName(organizer.schoolId).toUpperCase() : '';
  $('#admin-school-intro').textContent = organizer ? `Gerencie os passeios e as inscrições da ${schoolName(organizer.schoolId)}.` : '';
  $('#admin-event-count').textContent = String(events.length).padStart(2, '0');
  $('#admin-registration-count').textContent = String(events.reduce((sum, event) => sum + event.registrations.length, 0)).padStart(2, '0');
  $('#admin-seats-count').textContent = events.reduce((sum, event) => sum + (hasEnded(event) ? 0 : event.capacity - event.registrations.length), 0);
  $('#admin-list').innerHTML = events.map(event => {
    const { day, month } = dateParts(event.date);
    return `<article class="admin-event"><div class="admin-event-main"><time class="admin-date" datetime="${event.date}"><strong>${day}</strong><span>${month}</span></time><div><h3>${escapeHTML(event.title)}</h3><p>${escapeHTML(event.time)} · ${escapeHTML(event.location)} · ${escapeHTML(schoolName(event.schoolId))}</p></div></div><div class="admin-capacity"><span>${event.registrations.length} <span>/ ${event.capacity} inscritos</span></span><div class="progress" role="meter" aria-label="Vagas preenchidas" aria-valuemin="0" aria-valuemax="${event.capacity}" aria-valuenow="${event.registrations.length}"><span style="width:${event.registrations.length / event.capacity * 100}%"></span></div></div><div class="admin-event-actions"><button class="edit-event-button" data-edit-event="${escapeHTML(event.id)}" aria-label="Editar ${escapeHTML(event.title)}">${icon('edit')}</button><button class="text-button" data-participants="${escapeHTML(event.id)}">Participantes${icon('arrow')}</button></div></article>`;
  }).join('');
  if (organizer && !events.length) $('#admin-list').innerHTML = '<p class="empty">Sua escola ainda não tem passeios cadastrados. Crie o primeiro passeio.</p>';
  if (selectedEvent && managedEvent(selectedEvent)) renderParticipants();
  else {
    $('#participants-panel').hidden = true;
    $('#participants-title').textContent = '';
    $('#participants-body').innerHTML = '';
    $('#export-csv').disabled = true;
  }
}

function render() {
  const events = schoolEvents(agendaSchoolId()).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const student = getStudent();
  const schoolId = agendaSchoolId();
  $('#current-school-name').textContent = schoolId ? schoolName(schoolId) : '';
  $('#current-profile-name').textContent = student ? student.name.split(' ')[0] : getOrganizer() ? 'Organizador' : '';
  $('#current-school-avatar').textContent = schoolId ? schoolName(schoolId).slice(0, 2).toUpperCase() : '';
  $('#agenda-school-name').textContent = schoolId ? schoolName(schoolId).toUpperCase() : '';
  $('#agenda-intro').textContent = schoolId ? `Os próximos passeios da ${schoolName(schoolId)} estão aqui. Escolha sua saída e participe com a turma.` : '';
  $('#student-account-button').hidden = !student;
  $('#student-logout').hidden = !student;
  $('#student-account-label').textContent = student ? 'Meu cadastro' : 'Cadastre-se';
  $('#student-account-button').title = student ? `${student.name} · ${schoolName(student.schoolId)}` : 'Cadastro do aluno';
  $('#stat-events').textContent = String(events.filter(event => !hasEnded(event) && event.registrations.length < event.capacity).length).padStart(2, '0');
  $('#stat-seats').textContent = events.reduce((sum, event) => sum + (hasEnded(event) ? 0 : event.capacity - event.registrations.length), 0);
  $('#stat-registrations').textContent = String(events.reduce((sum, event) => sum + event.registrations.length, 0)).padStart(2, '0');
  $('#nav-count').textContent = String(events.length).padStart(2, '0');
  $('#all-count').textContent = events.length;
  renderFeatured(events);
  const query = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const filteredEvents = events.filter(event => (category === 'Todos' || event.category === category) && `${event.title} ${event.location} ${event.description}`.toLocaleLowerCase('pt-BR').includes(query));
  if ($('#sort-order').value === 'desc') filteredEvents.reverse();
  $('#event-count').textContent = String(filteredEvents.length).padStart(2, '0');
  $('#results-label').textContent = schoolId ? `${filteredEvents.length} ${filteredEvents.length === 1 ? 'passeio encontrado' : 'passeios encontrados'} · ${schoolName(schoolId)}` : '';
  $('#event-grid').innerHTML = filteredEvents.map(event => {
    const seats = event.capacity - event.registrations.length;
    const ended = hasEnded(event), registered = isRegistered(event), theme = categoryStyle[event.category];
    const { day, month } = dateParts(event.date);
    const buttonLabel = registered ? 'Inscrito' : ended ? 'Encerrado' : seats ? 'Inscrever-se' : 'Esgotado';
    return `<article class="event-card theme-${theme}"><div class="event-art"><img src="assets/${theme}.svg" alt="" width="760" height="460"><time class="date-stamp" datetime="${event.date}" aria-label="${escapeHTML(dateText(event.date))}"><strong>${day}</strong><span>${month}</span></time>${ended || !seats ? `<span class="closed-tag">${ended ? 'Encerrado' : 'Esgotado'}</span>` : ''}</div><div class="event-content"><div class="event-labels"><span class="category-tag"><span class="category-dot"></span>${escapeHTML(event.category)}</span><span class="event-time">${icon('clock')}${escapeHTML(event.time)}</span></div><h3>${escapeHTML(event.title)}</h3><p class="event-description">${escapeHTML(event.description)}</p><p class="event-location">${icon('pin')}${escapeHTML(event.location)}</p><div class="event-footer"><div class="capacity"><strong>${ended ? 'Evento encerrado' : `<span>${seats}</span> ${seats === 1 ? 'vaga disponível' : 'vagas disponíveis'}`}</strong><span>${event.registrations.length} de ${event.capacity} inscrições</span><div class="progress" role="meter" aria-label="Vagas preenchidas" aria-valuemin="0" aria-valuemax="${event.capacity}" aria-valuenow="${event.registrations.length}"><span style="width:${event.registrations.length / event.capacity * 100}%"></span></div></div><button class="card-button" data-register="${escapeHTML(event.id)}" ${!seats || ended || registered ? 'disabled' : ''}>${buttonLabel}${icon('up-right')}</button></div></div></article>`;
  }).join('');
  $('#empty-events').hidden = filteredEvents.length > 0;
  renderAdmin();
}

function renderParticipants() {
  const event = managedEvent(selectedEvent);
  if (!event) {
    $('#participants-panel').hidden = true;
    $('#participants-body').innerHTML = '';
    return;
  }
  $('#participants-panel').hidden = false;
  $('#participants-title').textContent = event.title;
  $('#participants-body').innerHTML = event.registrations.map(registration => `<tr><td>${escapeHTML(registration.name)}</td><td>${escapeHTML(registration.email)}</td><td>${escapeHTML(registration.phone || 'Não informado')}</td><td>${escapeHTML(schoolName(registration.schoolId))}</td><td>${escapeHTML(registration.classroom)}</td><td>${escapeHTML(new Date(registration.createdAt).toLocaleDateString('pt-BR'))}</td><td class="participant-actions"><button type="button" class="remove-participant-button" data-remove-registration="${escapeHTML(registrationKey(registration))}" data-event-id="${escapeHTML(event.id)}" aria-label="Remover inscrição de ${escapeHTML(registration.name)}">${icon('trash')}Remover</button></td></tr>`).join('');
  $('#empty-participants').hidden = event.registrations.length > 0;
  $('#export-csv').disabled = !event.registrations.length;
}

function prepareStudentForm() {
  const student = getStudent();
  editingStudentId = student?.id || null;
  $('#student-form').reset();
  $('#student-error').textContent = '';
  $('#student-page-title').innerHTML = student ? 'Seu cadastro<span>.</span>' : 'Vamos começar<span>.</span>';
  $('#student-form-intro').textContent = student ? 'Mantenha seus dados de participação atualizados.' : 'Crie sua conta e escolha sua escola para ver os passeios.';
  $('#student-submit-label').textContent = student ? 'Salvar alterações' : 'Criar minha conta';
  $('#student-back-label').textContent = student ? 'Voltar aos passeios' : 'Voltar ao login';
  $('#signup-login-note').hidden = Boolean(student);
  $('#student-password-label').textContent = student ? 'Nova senha (opcional)' : 'Crie uma senha';
  $('#student-password').required = !student;
  $('#student-password-confirm').required = !student;
  $('#student-password').placeholder = student ? 'Deixe em branco para manter a senha' : 'Pelo menos 6 caracteres';
  if (student) {
    for (const field of ['name', 'email', 'phone', 'schoolId']) $('#student-form').elements[field].value = student[field];
  }
}

function setView(view) {
  refreshStoredState();
  if (view === 'admin' && !getOrganizer()) view = 'login';
  if (view === 'events' && !agendaSchoolId()) view = 'student-login';
  if (!['events', 'admin', 'student', 'login', 'student-login'].includes(view)) view = 'student-login';
  if (view !== 'admin') $('#remove-registration-dialog').close();
  if (view === 'login' || view === 'student-login' || (view === 'student' && !getStudent())) {
    session = { studentId: null, organizer: null };
    selectedEvent = null;
    saveSession();
  }
  currentView = view;
  for (const name of ['events', 'admin', 'student', 'login', 'student-login']) $(`#${name}-view`).hidden = name !== view;
  const authMode = view === 'login' || view === 'student-login' || (view === 'student' && !getStudent());
  document.body.classList.toggle('auth-mode', authMode);
  document.title = { 'student-login': 'Entrar — GoEvent', login: 'Organizador — GoEvent', student: 'Cadastro — GoEvent', events: 'Passeios da escola — GoEvent', admin: 'Painel da escola — GoEvent' }[view];
  const navView = view === 'admin' || view === 'login' ? 'admin' : 'events';
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === navView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (view === 'student') prepareStudentForm();
  if (view === 'login') {
    $('#login-form').reset();
    $('#login-error').textContent = '';
    $('#organizer-password').type = 'password';
    $('#toggle-password').setAttribute('aria-pressed', 'false');
    $('#toggle-password').setAttribute('aria-label', 'Mostrar senha');
  }
  if (view === 'student-login') {
    $('#student-login-form').reset();
    $('#student-login-error').textContent = '';
  }
  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    $(`#${button.dataset.togglePassword}`).type = 'password';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Mostrar senha');
  });
  $('.skip-link').href = { events: '#agenda', admin: '#admin-list', student: '#student-form', login: '#login-form', 'student-login': '#student-login-form' }[view];
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function requireOrganizer() {
  const organizer = getOrganizer();
  if (!organizer) {
    $('#event-dialog').close();
    setView('login');
    notify('Entre com o acesso da sua escola para gerenciar eventos.');
  }
  return organizer;
}

function openRegistration(id) {
  refreshStoredState();
  if (!getStudent()) {
    pendingEventId = id;
    setView('student-login');
    notify('Entre como aluno para se inscrever em um passeio.');
    return;
  }
  const event = state.events.find(item => item.id === id && item.schoolId === agendaSchoolId());
  if (!event || hasEnded(event) || event.registrations.length >= event.capacity) {
    render();
    notify('Este evento não está disponível para inscrições.');
    return;
  }
  const student = getStudent();
  if (student.schoolId !== event.schoolId) { notify('Escolha um evento da sua escola.'); return; }
  if (isRegistered(event, student)) { notify('Você já está inscrito neste evento.'); return; }
  activeEvent = id;
  pendingEventId = null;
  $('#registration-form').reset();
  $('#registration-error').textContent = '';
  $('#registration-event').textContent = `${event.title} · ${dateText(event.date)} às ${event.time} · ${event.location}`;
  $('#registration-student-name').textContent = student.name;
  $('#registration-student-contact').textContent = `${student.email} · ${student.phone}`;
  $('#registration-student-school').textContent = schoolName(student.schoolId);
  $('#registration-dialog').showModal();
}

function openEventForm(id = null) {
  const organizer = requireOrganizer();
  if (!organizer) return;
  refreshStoredState();
  const existing = id ? managedEvent(id) : null;
  if (id && !existing) { notify('Este evento não pertence à sua escola.'); return; }
  editingEventId = existing?.id || null;
  $('#event-form').reset();
  $('#event-error').textContent = '';
  $('#event-form').elements.date.min = localDate(new Date());
  $('#new-event-title').innerHTML = existing ? 'Editar passeio<span>.</span>' : 'Coloque na agenda<span>.</span>';
  $('#event-submit-label').textContent = existing ? 'Salvar alterações' : 'Publicar passeio';
  $('#event-school-note').textContent = `O passeio será cadastrado na ${schoolName(organizer.schoolId)}.`;
  if (existing) {
    for (const field of ['title', 'category', 'capacity', 'date', 'time', 'location', 'description']) $('#event-form').elements[field].value = existing[field];
  }
  $('#event-dialog').showModal();
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-home], [data-back-agenda]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  pendingEventId = null;
  setView('events');
}));
$('[data-open-admin]').addEventListener('click', () => setView('admin'));
$('#student-account-button').addEventListener('click', () => { pendingEventId = null; setView('student'); });
$('#login-student-link').addEventListener('click', () => { pendingEventId = null; setView('student-login'); });
document.querySelectorAll('[data-student-login]').forEach(button => button.addEventListener('click', () => setView('student-login')));
document.querySelectorAll('[data-open-signup]').forEach(button => button.addEventListener('click', () => setView('student')));
$('#student-login-organizer').addEventListener('click', () => { pendingEventId = null; setView('login'); });

$('#student-form').addEventListener('submit', async event => {
  event.preventDefault();
  refreshStoredState();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = data.get('name').trim(), email = normalizeEmail(data.get('email'));
  const phone = data.get('phone').trim(), schoolId = data.get('schoolId');
  const password = data.get('password'), passwordConfirm = data.get('passwordConfirm');
  let existing = editingStudentId ? state.students.find(student => student.id === editingStudentId && student.id === session.studentId) : null;
  const duplicate = state.students.find(student => student.email === email && student.id !== existing?.id);
  let error = '';
  if (editingStudentId && !existing) error = 'Seu cadastro mudou. Volte à agenda e abra o formulário novamente.';
  else if (name.length < 3) error = 'Informe seu nome completo.';
  else if (!isValidPhone(phone)) error = 'Informe um telefone com DDD e 10 ou 11 dígitos.';
  else if (!isPartnerSchool(schoolId)) error = 'Selecione uma escola parceira do aplicativo.';
  else if (duplicate && hasCredentials(duplicate)) error = 'Este e-mail já tem uma conta. Entre com sua senha na tela de login.';
  else if (duplicate && (duplicate.name.toLocaleLowerCase('pt-BR') !== name.toLocaleLowerCase('pt-BR') || phoneDigits(duplicate.phone) !== phoneDigits(phone) || duplicate.schoolId !== schoolId)) error = 'Para atualizar um cadastro antigo sem senha, confirme o mesmo nome, telefone e escola usados antes.';
  else if ((!existing || password || passwordConfirm) && password.length < 6) error = 'Crie uma senha com pelo menos 6 caracteres.';
  else if (password !== passwordConfirm) error = 'As senhas não são iguais. Confira a confirmação.';
  else if (existing && state.events.some(item => item.registrations.some(registration => registration.studentId === existing.id) && item.registrations.some(registration => registration.studentId !== existing.id && registration.email === email))) error = 'Este e-mail já possui inscrição em um dos seus eventos.';
  $('#student-error').textContent = error;
  if (error) return;
  if (duplicate) existing = duplicate;
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  let credentials;
  try {
    credentials = password ? await createCredentials(password) : {};
  } catch {
    $('#student-error').textContent = 'Não foi possível preparar o acesso. Use o Chrome ou o Edge atualizado e tente novamente.';
    submitButton.disabled = false;
    return;
  }
  submitButton.disabled = false;
  if (currentView !== 'student') return;
  refreshStoredState();
  if (state.students.some(student => student.email === email && student.id !== existing?.id)) {
    $('#student-error').textContent = 'Este e-mail acabou de ser cadastrado. Entre pela tela de login.';
    return;
  }
  const student = { ...existing, id: existing?.id || uid(), name, email, phone: formatPhone(phone), schoolId, ...credentials };
  const next = JSON.parse(JSON.stringify(state));
  const index = next.students.findIndex(item => item.id === student.id);
  if (index === -1) next.students.push(student);
  else next.students[index] = student;
  // Keep the participant contact details in sync with an edited profile.
  next.events.forEach(item => item.registrations.forEach(registration => {
    if (registration.studentId === student.id && item.schoolId === student.schoolId) {
      Object.assign(registration, { name, email, phone: student.phone, schoolId });
    }
  }));
  if (!persist(next)) return;
  session.studentId = student.id;
  session.organizer = null;
  saveSession();
  form.reset();
  const resume = pendingEventId;
  pendingEventId = null;
  setView('events');
  notify(existing ? 'Cadastro atualizado.' : `Conta criada! Confira os passeios da ${schoolName(student.schoolId)}.`);
  if (resume) openRegistration(resume);
});

$('#student-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  refreshStoredState();
  const form = event.currentTarget, data = new FormData(form);
  const student = state.students.find(item => item.email === normalizeEmail(data.get('email')) && isPartnerSchool(item.schoolId));
  $('#student-login-error').textContent = '';
  if (student && !hasCredentials(student)) {
    $('#student-login-error').textContent = 'Seu cadastro antigo ainda não tem senha. Clique em Criar minha conta e confirme seus dados para definir uma senha.';
    return;
  }
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const valid = student && await passwordDigest(data.get('password'), student.passwordSalt) === student.passwordHash;
    if (currentView !== 'student-login') return;
    if (!valid) {
      $('#student-login-error').textContent = 'E-mail ou senha incorretos. Confira seus dados e tente novamente.';
      return;
    }
    refreshStoredState();
    const latest = state.students.find(item => item.id === student.id);
    if (!latest || latest.passwordHash !== student.passwordHash || !isPartnerSchool(latest.schoolId)) {
      $('#student-login-error').textContent = 'Seu cadastro foi atualizado. Tente entrar novamente.';
      return;
    }
    session = { studentId: student.id, organizer: null };
    saveSession();
    form.reset();
    const resume = pendingEventId;
    pendingEventId = null;
    setView('events');
    notify(`Olá, ${student.name.split(' ')[0]}! Veja os passeios da sua escola.`);
    if (resume) openRegistration(resume);
  } catch {
    $('#student-login-error').textContent = 'Não foi possível entrar. Use um navegador atualizado e tente novamente.';
  } finally {
    submitButton.disabled = false;
  }
});

$('#student-form').elements.phone.addEventListener('blur', event => {
  if (isValidPhone(event.target.value)) event.target.value = formatPhone(event.target.value);
});

$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  if (normalizeEmail(data.get('email')) !== ORGANIZER_ACCOUNT.email || data.get('password') !== ORGANIZER_ACCOUNT.password) {
    $('#login-error').textContent = 'E-mail ou senha incorretos. Confira o acesso da sua escola.';
    return;
  }
  session.organizer = { email: ORGANIZER_ACCOUNT.email, schoolId: ORGANIZER_ACCOUNT.schoolId };
  session.studentId = null;
  saveSession();
  $('#login-form').reset();
  setView('admin');
  notify('Bem-vindo ao painel da Fortec.');
});

document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => {
  const input = $(`#${button.dataset.togglePassword}`);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
  button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
}));

$('#student-logout').addEventListener('click', () => {
  session = { studentId: null, organizer: null };
  pendingEventId = null;
  activeEvent = null;
  selectedEvent = null;
  $('#registration-dialog').close();
  saveSession();
  setView('student-login');
  notify('Você saiu da sua conta.');
});

$('#organizer-logout').addEventListener('click', () => {
  session.organizer = null;
  selectedEvent = null;
  editingEventId = null;
  $('#event-dialog').close();
  saveSession();
  setView('events');
  notify('Você saiu do painel do organizador.');
});

document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
  category = button.dataset.category;
  document.querySelectorAll('[data-category]').forEach(item => {
    item.classList.toggle('selected', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
  render();
}));
$('#search').addEventListener('input', render);
$('#sort-order').addEventListener('change', render);
document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => {
  $('#event-grid').classList.toggle('is-list', button.dataset.layout === 'list');
  document.querySelectorAll('[data-layout]').forEach(item => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
}));
$('#events-view').addEventListener('click', event => {
  const button = event.target.closest('[data-register]');
  if (button && !button.disabled) openRegistration(button.dataset.register);
});
$('#edit-student-registration').addEventListener('click', () => {
  $('#registration-dialog').close();
  pendingEventId = activeEvent;
  setView('student');
});

$('#registration-form').addEventListener('submit', event => {
  event.preventDefault();
  refreshStoredState();
  const student = getStudent();
  const item = state.events.find(candidate => candidate.id === activeEvent);
  const classroom = new FormData(event.currentTarget).get('classroom').trim();
  let error = '';
  if (!student) error = 'Entre na sua conta de aluno antes de se inscrever.';
  else if (!item || item.schoolId !== student.schoolId) error = 'Você só pode se inscrever em eventos da sua escola.';
  else if (hasEnded(item)) error = 'As inscrições para este evento estão encerradas.';
  else if (!classroom) error = 'Informe sua turma.';
  else if (isRegistered(item, student)) error = 'Você já está inscrito neste evento.';
  else if (item.registrations.length >= item.capacity) error = 'Todas as vagas deste evento foram preenchidas.';
  $('#registration-error').textContent = error;
  if (error) { render(); return; }
  const next = JSON.parse(JSON.stringify(state));
  next.events.find(candidate => candidate.id === activeEvent).registrations.push({
    studentId: student.id, schoolId: student.schoolId, name: student.name,
    email: student.email, phone: student.phone, classroom, createdAt: new Date().toISOString()
  });
  if (!persist(next)) return;
  $('#registration-dialog').close();
  render();
  notify(`Inscrição confirmada em ${item.title}!`);
});

$('#new-event').addEventListener('click', () => openEventForm());
$('#event-form').addEventListener('submit', event => {
  event.preventDefault();
  const organizer = requireOrganizer();
  if (!organizer) return;
  refreshStoredState();
  const existing = editingEventId ? managedEvent(editingEventId) : null;
  if (editingEventId && !existing) { $('#event-error').textContent = 'Este evento não pertence à sua escola.'; return; }
  const data = new FormData(event.currentTarget);
  const item = {
    id: existing?.id || uid(), schoolId: organizer.schoolId,
    title: data.get('title').trim(), category: data.get('category'), capacity: Number(data.get('capacity')),
    date: data.get('date'), time: data.get('time'), location: data.get('location').trim(),
    description: data.get('description').trim(), registrations: existing?.registrations || []
  };
  let error = '';
  if (item.title.length < 3 || !item.location || !item.description) error = 'Preencha o nome, o local e a descrição do evento.';
  else if (!Object.hasOwn(categoryStyle, item.category)) error = 'Selecione uma categoria válida.';
  else if (!Number.isInteger(item.capacity) || item.capacity < 1 || item.capacity > 10000) error = 'Informe entre 1 e 10.000 vagas.';
  else if (item.capacity < item.registrations.length) error = 'O total de vagas não pode ser menor que o número de inscritos.';
  else if (!Number.isFinite(new Date(`${item.date}T${item.time}`).getTime()) || hasEnded(item)) error = 'Escolha uma data e um horário no futuro.';
  $('#event-error').textContent = error;
  if (error) return;
  const next = { ...state, events: existing ? state.events.map(candidate => candidate.id === item.id && candidate.schoolId === organizer.schoolId ? item : candidate) : [...state.events, item] };
  if (!persist(next)) return;
  $('#event-dialog').close();
  editingEventId = null;
  render();
  notify(existing ? 'Evento atualizado.' : 'Evento publicado na agenda da Fortec.');
});

$('#admin-list').addEventListener('click', event => {
  const button = event.target.closest('[data-participants], [data-edit-event]');
  if (!button || !requireOrganizer()) return;
  refreshStoredState();
  const id = button.dataset.participants || button.dataset.editEvent;
  if (!managedEvent(id)) { notify('Este evento não pertence à sua escola.'); return; }
  if (button.hasAttribute('data-edit-event')) { openEventForm(id); return; }
  selectedEvent = id;
  renderParticipants();
  $('#participants-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function openRegistrationRemoval(eventId, key) {
  const organizer = requireOrganizer();
  if (!organizer) return;
  refreshStoredState();
  const event = managedEvent(eventId);
  if (!event) { notify('Este evento não pertence à sua escola.'); return; }
  const registration = event.registrations.find(item => registrationKey(item) === key);
  if (!registration) { render(); notify('Esta inscrição foi atualizada. Confira a lista novamente.'); return; }
  pendingRegistrationRemoval = { eventId, key, schoolId: organizer.schoolId, organizerEmail: organizer.email };
  $('#remove-registration-description').textContent = `Você vai remover ${registration.name} do passeio “${event.title}”.`;
  $('#remove-registration-error').textContent = '';
  $('#remove-registration-dialog').showModal();
}

$('#participants-body').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-registration]');
  if (button) openRegistrationRemoval(button.dataset.eventId, button.dataset.removeRegistration);
});

$('#remove-registration-form').addEventListener('submit', event => {
  event.preventDefault();
  const pending = pendingRegistrationRemoval;
  if (!pending || !$('#remove-registration-dialog').open) return;
  const organizer = requireOrganizer();
  if (!organizer) return;
  refreshStoredState();
  const item = managedEvent(pending.eventId);
  if (!item || organizer.schoolId !== pending.schoolId || organizer.email !== pending.organizerEmail) {
    $('#remove-registration-dialog').close();
    render();
    notify('Você não tem acesso para remover inscrições deste evento.');
    return;
  }
  const index = item.registrations.findIndex(registration => registrationKey(registration) === pending.key);
  if (index === -1) {
    $('#remove-registration-dialog').close();
    render();
    notify('A inscrição já foi removida ou atualizada. A lista foi recarregada.');
    return;
  }
  const name = item.registrations[index].name;
  const next = JSON.parse(JSON.stringify(state));
  next.events.find(candidate => candidate.id === item.id && candidate.schoolId === organizer.schoolId).registrations.splice(index, 1);
  if (!persist(next)) {
    $('#remove-registration-error').textContent = 'Não foi possível salvar a remoção. Tente novamente.';
    return;
  }
  $('#remove-registration-dialog').close();
  render();
  notify(`Inscrição de ${name} removida. A vaga foi liberada.`);
});

$('#remove-registration-dialog').addEventListener('close', () => {
  if ($('#remove-registration-dialog').open) return;
  pendingRegistrationRemoval = null;
  $('#remove-registration-description').textContent = '';
  $('#remove-registration-error').textContent = '';
});

document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

$('#export-csv').addEventListener('click', () => {
  if (!requireOrganizer()) return;
  refreshStoredState();
  const event = managedEvent(selectedEvent);
  if (!event || !event.registrations.length) return;
  const cell = value => {
    let text = String(value);
    if (/^\s*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const rows = [['Nome', 'E-mail', 'Telefone', 'Escola', 'Turma', 'Data da inscrição'], ...event.registrations.map(registration => [registration.name, registration.email, registration.phone, schoolName(registration.schoolId), registration.classroom, new Date(registration.createdAt).toLocaleDateString('pt-BR')])];
  const blob = new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = `fortec-participantes-${event.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) { refreshStoredState(); render(); }
});
document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
document.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('selected'))));
$('#today-label').dateTime = localDate(new Date());
$('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
setView('student-login');
if (storageWarning) notify('Não foi possível acessar todos os dados salvos. Confira a permissão de armazenamento do navegador.');
