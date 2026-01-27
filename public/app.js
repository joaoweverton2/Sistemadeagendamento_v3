// ============= CONSTANTES =============
const API_URL = '/api';
const HOURS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];
const CITIES = {
    'CE': { id: 1, name: 'Fortaleza', state: 'CE' },
    'PB': { id: 2, name: 'João Pessoa', state: 'PB' },
    'RN': { id: 3, name: 'Natal', state: 'RN' },
    'BA': { id: 4, name: 'Eunápolis', state: 'BA' },
    'MG': { id: 5, name: 'Poços de Caldas', state: 'MG' },
    'SP-Ourinhos': { id: 6, name: 'Ourinhos', state: 'SP' },
    'SP-Itupeva': { id: 7, name: 'Itupeva', state: 'SP' },
    'SP-Registro': { id: 8, name: 'Registro', state: 'SP' }
};

// ============= ESTADO GLOBAL =============
let state = {
    selectedState: null,
    selectedDate: null,
    selectedTime: null,
    currentBookings: [],
    unavailabilities: []
};

// ============= INICIALIZAÇÃO =============
document.addEventListener('DOMContentLoaded', () => {
    loadBookings();
});

// ============= CALENDÁRIO =============
function onStateChange() {
    const stateSelect = document.getElementById('state-select');
    state.selectedState = stateSelect.value;
    state.selectedDate = null;
    state.selectedTime = null;
    
    if (state.selectedState) {
        // Carregar agendamentos e indisponibilidades antes de renderizar
        Promise.all([
            fetch(`${API_URL}/bookings`).then(res => res.json()),
            fetch(`${API_URL}/cdl/unavailabilities/${CITIES[state.selectedState].id}`).then(res => res.json())
        ]).then(([bookings, unavailabilities]) => {
            state.currentBookings = bookings;
            state.unavailabilities = unavailabilities;
            renderCalendar();
        }).catch(err => {
            console.error('Erro ao carregar dados:', err);
            renderCalendar();
        });
    } else {
        document.getElementById('calendar-container').innerHTML = '';
    }
}

function renderCalendar() {
    const container = document.getElementById('calendar-container');
    container.innerHTML = '';
    
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Renderizar 2 meses
    for (let monthOffset = 0; monthOffset < 2; monthOffset++) {
        const month = (currentMonth + monthOffset) % 12;
        const year = currentYear + Math.floor((currentMonth + monthOffset) / 12);
        
        const monthGrid = createMonthGrid(year, month);
        container.appendChild(monthGrid);
    }
}

function createMonthGrid(year, month) {
    const monthDiv = document.createElement('div');
    monthDiv.className = 'calendar-grid';
    
    // Cabeçalho com mês/ano
    const monthHeader = document.createElement('div');
    monthHeader.style.gridColumn = '1 / -1';
    monthHeader.style.fontSize = '18px';
    monthHeader.style.fontWeight = '600';
    monthHeader.style.padding = '15px 0';
    monthHeader.style.textAlign = 'center';
    monthHeader.style.color = '#2c3e50';
    monthHeader.textContent = new Date(year, month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    monthDiv.appendChild(monthHeader);
    
    // Dias da semana
    const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    weekdays.forEach(day => {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-weekday';
        dayEl.textContent = day;
        monthDiv.appendChild(dayEl);
    });
    
    // Dias do mês
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    // Dias vazios antes do primeiro dia
    for (let i = 0; i < firstDay; i++) {
        const emptyDiv = document.createElement('div');
        monthDiv.appendChild(emptyDiv);
    }
    
    // Dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayEl = createDayElement(date, today);
        monthDiv.appendChild(dayEl);
    }
    
    return monthDiv;
}

function createDayElement(date, today) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    
    const dayNumber = date.getDate();
    const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'short' });
    
    // CORREÇÃO: Criar data no formato correto sem problemas de fuso horário
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    console.log(`Data clicada: ${date.toDateString()}, DateStr: ${dateStr}, Day: ${dayNumber}`);
    
    // CORREÇÃO: Verificar se é passado - comparar apenas dia/mês/ano
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const isPast = dateStart < todayStart;
    
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = checkHoliday(date);
    const isUnavailable = checkUnavailability(dateStr);
    
    const isDisabled = isPast || isWeekend || isHoliday || isUnavailable;
    
    if (isDisabled) {
        dayEl.classList.add('unavailable');
    }
    
    // Conteúdo do dia
    const dayNumberEl = document.createElement('div');
    dayNumberEl.className = 'calendar-day-number';
    dayNumberEl.textContent = dayNumber;
    
    const dayWeekdayEl = document.createElement('div');
    dayWeekdayEl.className = 'calendar-day-weekday';
    dayWeekdayEl.textContent = dayOfWeek.toUpperCase();
    
    dayEl.appendChild(dayNumberEl);
    dayEl.appendChild(dayWeekdayEl);
    
    // Tooltip com horários
    if (!isDisabled) {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        
        const hoursDiv = document.createElement('div');
        hoursDiv.className = 'tooltip-hours';
        
        HOURS.forEach(hour => {
            const hourEl = document.createElement('div');
            hourEl.className = 'tooltip-hour';
            
            // Verificar se o horário já passou para o dia de hoje
            const [h, m] = hour.split(':').map(Number);
            const hourDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
            const todayHour = new Date(today.getFullYear(), today.getMonth(), today.getDate(), today.getHours(), today.getMinutes());
            const isPastHour = hourDate < todayHour;
            
            // Verificar se o horário já está agendado para esta cidade/data
            const cityId = CITIES[state.selectedState].id;
            const isBooked = state.currentBookings.some(b => 
                b.city_id === cityId && 
                b.booking_date === dateStr && 
                b.booking_time === hour &&
                b.status === 'confirmed'
            );
            
            if (isPastHour) {
                hourEl.classList.add('past');
            } else if (isBooked) {
                hourEl.classList.add('booked');
            }
            
            hourEl.textContent = hour;
            hourEl.onclick = (e) => {
                e.stopPropagation();
                if (!isPastHour && !isBooked) {
                    selectDateTime(dateStr, hour);
                }
            };
            hoursDiv.appendChild(hourEl);
        });
        
        tooltip.appendChild(hoursDiv);
        dayEl.appendChild(tooltip);
    }
    
    return dayEl;
}

function checkHoliday(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    // Feriados nacionais
    const nationalHolidays = [
        [1, 1],   // Ano Novo
        [4, 21],  // Tiradentes
        [5, 1],   // Dia do Trabalho
        [9, 7],   // Independência
        [10, 12], // Nossa Senhora Aparecida
        [11, 2],  // Finados
        [11, 20], // Consciência Negra
        [12, 25]  // Natal
    ];
    
    // Feriados estaduais
    const stateHolidays = {
        'CE': [[3, 19]], // São José
        'PB': [[8, 5]], // Nossa Senhora das Neves
        'RN': [[12, 3]], // Santo Antônio
        'BA': [[11, 2]], // Finados
        'MG': [[12, 8]], // Nossa Senhora da Conceição
        'SP': [[11, 20]] // Consciência Negra
    };
    
    // Verificar feriados nacionais
    for (const [m, d] of nationalHolidays) {
        if (m === month && d === day) return true;
    }
    
    // Verificar feriados estaduais
    const stateCode = state.selectedState?.split('-')[0];
    if (stateCode && stateHolidays[stateCode]) {
        for (const [m, d] of stateHolidays[stateCode]) {
            if (m === month && d === day) return true;
        }
    }
    
    return false;
}

function checkUnavailability(dateStr) {
    return state.unavailabilities.some(u => u.unavailable_date === dateStr);
}

function selectDateTime(dateStr, time) {
    console.log(`selectDateTime chamado com: ${dateStr} ${time}`);
    
    state.selectedDate = dateStr;
    state.selectedTime = time;
    
    // CORREÇÃO: Criar data no fuso horário local para formatação correta
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    
    console.log(`dateObj criado: ${dateObj.toString()}`);
    
    // Formatar para exibição
    const dateFormatted = dateObj.toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric'
    });
    
    document.getElementById('selected-datetime').textContent = `${dateFormatted} às ${time}`;
    
    // Mostrar formulário
    showSection('booking-form-section');
}

// ============= FORMULÁRIO DE AGENDAMENTO =============
function submitBooking(event) {
    event.preventDefault();
    
    const companyName = document.getElementById('company-name').value;
    const vehiclePlate = document.getElementById('vehicle-plate').value;
    const invoiceNumber = document.getElementById('invoice-number').value;
    const driverName = document.getElementById('driver-name').value;
    
    const cityId = CITIES[state.selectedState].id;
    
    const bookingData = {
        city_id: cityId,
        company_name: companyName,
        vehicle_plate: vehiclePlate,
        invoice_number: invoiceNumber,
        driver_name: driverName,
        booking_date: state.selectedDate,
        booking_time: state.selectedTime
    };
    
    fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
    })
    .then(res => res.json())
    .then(data => {
        if (data.id) {
            // Gerar protocolo
            const protocol = generateProtocol(state.selectedDate, state.selectedTime, data.id);
            showProtocolModal(protocol);
            
            // Limpar formulário
            document.getElementById('booking-form').reset();
            
            // Recarregar agendamentos e atualizar calendário
            fetch(`${API_URL}/bookings`)
                .then(res => res.json())
                .then(bookings => {
                    state.currentBookings = bookings;
                    renderBookings(bookings);
                    renderCalendar(); // Atualiza o calendário para mostrar o novo horário como ocupado
                });
        } else {
            showNotification('Erro ao criar agendamento', 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showNotification('Erro ao conectar com o servidor', 'error');
    });
}

function generateProtocol(date, time, bookingId) {
    // Formato: BK-YYYYMMDD-HHMM
    const dateStr = date.replace(/-/g, '');
    const timeStr = time.replace(':', '');
    return `BK-${dateStr}-${timeStr}`;
}

function showProtocolModal(protocol) {
    document.getElementById('protocol-number').textContent = protocol;
    document.getElementById('protocol-modal').classList.remove('hidden');
}

function closeProtocolModal() {
    document.getElementById('protocol-modal').classList.add('hidden');
    goBackToCalendar();
}

// ============= NAVEGAÇÃO =============
function goBackToCalendar() {
    showSection('calendar-section');
    state.selectedDate = null;
    state.selectedTime = null;
}

function goToMyBookings() {
    showSection('my-bookings-section');
    loadBookings();
}

function showSection(sectionId) {
    // Esconder todas as seções
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Mostrar seção desejada
    document.getElementById(sectionId).classList.add('active');
}

// ============= MEUS AGENDAMENTOS =============
function loadBookings() {
    fetch(`${API_URL}/bookings`)
        .then(res => res.json())
        .then(data => {
            state.currentBookings = data;
            renderBookings(data);
        })
        .catch(err => console.error(err));
}

function renderBookings(bookings) {
    const list = document.getElementById('bookings-list');
    const searchTerm = document.getElementById('search-protocol').value.trim();
    
    if (!searchTerm) {
        list.innerHTML = '<p style="padding: 40px; text-align: center; color: #7f8c8d;">Digite o número do protocolo para visualizar seu agendamento.</p>';
        return;
    }
    
    if (bookings.length === 0) {
        list.innerHTML = '<p style="padding: 40px; text-align: center; color: #e74c3c; font-weight: 600;">Nenhum agendamento encontrado para este protocolo.</p>';
        return;
    }
    
    list.innerHTML = bookings.map(booking => {
        const protocol = generateProtocol(booking.booking_date, booking.booking_time, booking.id);
        const date = new Date(booking.booking_date).toLocaleDateString('pt-BR');
        const canCancel = canCancelBooking(booking.created_at);
        
        return `
            <div class="booking-card">
                <div class="booking-info">
                    <div class="booking-protocol">Protocolo: ${protocol}</div>
                    <div class="booking-company">${booking.company_name}</div>
                    <div class="booking-details">
                        NF: ${booking.invoice_number} | Motorista: ${booking.driver_name} | 
                        ${date} às ${booking.booking_time}
                    </div>
                </div>
                <div class="booking-status ${booking.status}">
                    ${booking.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}
                </div>
                <div class="booking-actions">
                    ${booking.status === 'confirmed' && canCancel ? `
                        <button class="btn-action btn-cancel" onclick="cancelBooking('${booking.id}')">
                            Cancelar
                        </button>
                        <button class="btn-action btn-edit" onclick="editBooking('${booking.id}')">
                            Alterar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function searchBookings() {
    const searchTerm = document.getElementById('search-protocol').value.trim().toLowerCase();
    
    if (!searchTerm) {
        renderBookings([]);
        return;
    }
    
    const filtered = state.currentBookings.filter(booking => {
        const protocol = generateProtocol(booking.booking_date, booking.booking_time, booking.id);
        // Busca exata para maior segurança
        return protocol.toLowerCase() === searchTerm;
    });
    renderBookings(filtered);
}

function canCancelBooking(createdAt) {
    const created = new Date(createdAt);
    const now = new Date();
    const diffHours = (now - created) / (1000 * 60 * 60);
    return diffHours < 24;
}

function cancelBooking(bookingId) {
    if (confirm('Tem certeza que deseja cancelar este agendamento?')) {
        fetch(`${API_URL}/bookings/${bookingId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Cancelado pelo fornecedor' })
        })
        .then(res => res.json())
        .then(data => {
            showNotification('Agendamento cancelado com sucesso', 'success');
            loadBookings();
        })
        .catch(err => {
            console.error(err);
            showNotification('Erro ao cancelar agendamento', 'error');
        });
    }
}

function editBooking(bookingId) {
    // Encontrar o agendamento na lista
    const booking = state.currentBookings.find(b => b.id == bookingId);
    if (!booking) return;
    
    if (confirm('Você será redirecionado para criar um novo agendamento. O antigo será mantido como histórico. Deseja continuar?')) {
        // Preencher o formulário com os dados atuais
        document.getElementById('company-name').value = booking.company_name;
        document.getElementById('vehicle-plate').value = booking.vehicle_plate;
        document.getElementById('invoice-number').value = booking.invoice_number;
        document.getElementById('driver-name').value = booking.driver_name;
        
        // Ir para o calendário
        goBackToCalendar();
        // Selecionar o estado correspondente
        const stateSelect = document.getElementById('state-select');
        // Encontrar a chave do estado baseado no city_id ou nome da cidade
        const cityKey = Object.keys(CITIES).find(key => 
            CITIES[key].id == booking.city_id || CITIES[key].name == booking.city
        );
        if (cityKey) {
            stateSelect.value = cityKey;
            onStateChange();
        }
        
        showNotification('Preencha os dados e selecione um novo horário. O agendamento antigo será mantido como histórico.', 'info');
    }
}

// ============= CDL MANAGEMENT =============
function showCDLAccess() {
    showSection('cdl-section');
}

function submitCDLForm(event) {
    event.preventDefault();
    
    const pin = document.getElementById('cdl-pin').value;
    const stateVal = document.getElementById('cdl-state').value;
    const date = document.getElementById('cdl-date').value;
    const reason = document.getElementById('cdl-reason').value;
    
    const cityId = CITIES[stateVal].id;
    
    const data = {
        pin: pin,
        city_id: cityId,
        unavailable_date: date,
        unavailable_time: null, // Sempre nulo para comprometer o dia inteiro
        reason: reason
    };
    
    fetch(`${API_URL}/cdl/unavailability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.message) {
            showNotification('Indisponibilidade registrada com sucesso', 'success');
            document.getElementById('cdl-form').reset();
            loadUnavailabilities();
        } else {
            showNotification(data.error || 'Erro ao registrar indisponibilidade', 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showNotification('Erro ao conectar com o servidor', 'error');
    });
}

function loadUnavailabilities() {
    if (!state.selectedState) return;
    
    const cityId = CITIES[state.selectedState].id;
    
    fetch(`${API_URL}/cdl/unavailabilities/${cityId}`)
        .then(res => res.json())
        .then(data => {
            state.unavailabilities = data;
            renderCalendar(); // Renderizar após carregar as indisponibilidades
        })
        .catch(err => {
            console.error(err);
            renderCalendar(); // Renderizar mesmo se falhar
        });
}

// ============= NOTIFICAÇÕES =============
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ============= UTILITÁRIOS =============
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
}

function formatTime(timeStr) {
    return timeStr;
}
