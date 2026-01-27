import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
// Remover import não necessário para o __filename
// import { fileURLToPath } from 'url';

const dbPath = path.join(path.join(process.cwd(), 'data', 'agendamentos.db'));

// Criar diretório data se não existir
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
    } else {
        console.log('✅ Conectado ao SQLite');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Tabela de cidades
        db.run(`
            CREATE TABLE IF NOT EXISTS cities (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                state TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de agendamentos
        db.run(`
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city_id INTEGER NOT NULL,
                company_name TEXT NOT NULL,
                vehicle_plate TEXT NOT NULL,
                invoice_number TEXT NOT NULL,
                driver_name TEXT NOT NULL,
                booking_date DATE NOT NULL,
                booking_time TIME NOT NULL,
                status TEXT DEFAULT 'confirmed',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (city_id) REFERENCES cities(id)
            )
        `);

        // Tabela de indisponibilidades
        db.run(`
            CREATE TABLE IF NOT EXISTS unavailabilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city_id INTEGER NOT NULL,
                unavailable_date DATE NOT NULL,
                unavailable_time TIME,
                reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (city_id) REFERENCES cities(id)
            )
        `);

        // Inserir cidades
        const cities = [
            { id: 1, name: 'Fortaleza', state: 'CE' },
            { id: 2, name: 'João Pessoa', state: 'PB' },
            { id: 3, name: 'Natal', state: 'RN' },
            { id: 4, name: 'Eunápolis', state: 'BA' },
            { id: 5, name: 'Poços de Caldas', state: 'MG' },
            { id: 6, name: 'Ourinhos', state: 'SP' },
            { id: 7, name: 'Itupeva', state: 'SP' },
            { id: 8, name: 'Registro', state: 'SP' }
        ];

        cities.forEach(city => {
            db.run(
                'INSERT OR IGNORE INTO cities (id, name, state) VALUES (?, ?, ?)',
                [city.id, city.name, city.state]
            );
        });

        console.log('✅ Banco de dados inicializado com sucesso');
    });
}

export default db;