import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './database.js';
import { initializeGoogleSheets } from './googleSheets.js';

const app = express();
const sheetsService = initializeGoogleSheets();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../public')));

// GET /api/bookings - Listar todos os agendamentos
app.get('/api/bookings', (req: Request, res: Response) => {
    db.all(
        `SELECT b.*, c.name as city FROM bookings b 
         JOIN cities c ON b.city_id = c.id 
         ORDER BY b.booking_date DESC`,
        (err: any, rows: any) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows || []);
            }
        }
    );
});

// POST /api/bookings - Criar novo agendamento
app.post('/api/bookings', (req: Request, res: Response) => {
    const { city_id, company_name, vehicle_plate, invoice_number, driver_name, booking_date, booking_time } = req.body;

    if (!city_id || !company_name || !vehicle_plate || !invoice_number || !driver_name || !booking_date || !booking_time) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    db.run(
        `INSERT INTO bookings (city_id, company_name, vehicle_plate, invoice_number, driver_name, booking_date, booking_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [city_id, company_name, vehicle_plate, invoice_number, driver_name, booking_date, booking_time],
        function(err: any) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                const bookingId = this.lastID;
                res.json({ id: bookingId, status: 'confirmed' });

                // Sincronizar com Google Sheets se disponível
                if (sheetsService) {
                    db.get(
                        `SELECT b.*, c.name as city FROM bookings b 
                         JOIN cities c ON b.city_id = c.id 
                         WHERE b.id = ?`,
                        [bookingId],
                        (err, row) => {
                            if (!err && row) {
                                sheetsService.appendBooking(row);
                            }
                        }
                    );
                }
            }
        }
    );
});

// GET /api/bookings/:id - Obter agendamento específico
app.get('/api/bookings/:id', (req: Request, res: Response) => {
    const { id } = req.params;

    db.get(
        `SELECT b.*, c.name as city FROM bookings b 
         JOIN cities c ON b.city_id = c.id 
         WHERE b.id = ?`,
        [id],
        (err: any, row: any) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (!row) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
            } else {
                res.json(row);
            }
        }
    );
});

// POST /api/bookings/:id/cancel - Cancelar agendamento
app.post('/api/bookings/:id/cancel', (req: Request, res: Response) => {
    const { id } = req.params;

    db.run(
        `UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id],
        function(err: any) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
            } else {
                res.json({ message: 'Agendamento cancelado com sucesso' });
            }
        }
    );
});

// GET /api/cdl/unavailabilities/:city_id - Listar indisponibilidades
app.get('/api/cdl/unavailabilities/:city_id', (req: Request, res: Response) => {
    const { city_id } = req.params;

    db.all(
        `SELECT * FROM unavailabilities WHERE city_id = ? ORDER BY unavailable_date DESC`,
        [city_id],
        (err: any, rows: any) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows || []);
            }
        }
    );
});

// POST /api/cdl/unavailability - Registrar indisponibilidade
app.post('/api/cdl/unavailability', (req: Request, res: Response) => {
    const { pin, city_id, unavailable_date, unavailable_time, reason } = req.body;

    // Validar PIN (padrão: 1235)
    if (pin !== '1235') {
        return res.status(401).json({ error: 'PIN inválido' });
    }

    if (!city_id || !unavailable_date || !reason) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    db.run(
        `INSERT INTO unavailabilities (city_id, unavailable_date, unavailable_time, reason)
         VALUES (?, ?, ?, ?)`,
        [city_id, unavailable_date, unavailable_time || null, reason],
        function(err: any) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ message: 'Indisponibilidade registrada com sucesso', id: this.lastID });
                
                // Sincronizar com Google Sheets se disponível
                if (sheetsService) {
                    sheetsService.appendUnavailability({
                        city_id,
                        unavailable_date,
                        unavailable_time,
                        reason
                    });
                }
            }
        }
    );
});

// GET /api/cities - Listar todas as cidades
app.get('/api/cities', (req: Request, res: Response) => {
    db.all(`SELECT * FROM cities ORDER BY state, name`, (err: any, rows: any) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows || []);
        }
    });
});

// GET /api/health - Health check
app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 Servidor de Agendamento de Mercadorias                ║
║  Rodando em: http://localhost:${PORT}                      ║
║  Banco de dados: SQLite                                    ║
║  Google Sheets: Integrado                                  ║
╚════════════════════════════════════════════════════════════╝
    `);
});

export default app;
