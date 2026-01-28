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
app.get('/api/bookings', (_req: Request, res: Response) => {
    db.all(
        `SELECT b.*, c.name as city FROM bookings b 
         JOIN cities c ON b.city_id = c.id 
         ORDER BY b.booking_date DESC`,
        (err: any, rows: any) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows || []);
        }
    );
});

// POST /api/bookings - Criar novo agendamento
app.post('/api/bookings', (req: Request, res: Response) => {
    const { city_id, company_name, vehicle_plate, invoice_number, driver_name, booking_date, booking_time } = req.body;

    if (!city_id || !company_name || !vehicle_plate || !invoice_number || !driver_name || !booking_date || !booking_time) {
        res.status(400).json({ error: 'Campos obrigatórios faltando' });
        return;
    }

    db.run(
        `INSERT INTO bookings (city_id, company_name, vehicle_plate, invoice_number, driver_name, booking_date, booking_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [city_id, company_name, vehicle_plate, invoice_number, driver_name, booking_date, booking_time],
        function(err: any) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            const bookingId = this.lastID;
            res.json({ id: bookingId, status: 'confirmed' });

            // Sincronizar com Google Sheets se disponível
            if (sheetsService) {
                db.get(
                    `SELECT b.*, c.name as city FROM bookings b 
                     JOIN cities c ON b.city_id = c.id 
                     WHERE b.id = ?`,
                    [bookingId],
                    (err: any, row: any) => {
                        if (!err && row) {
                            sheetsService.appendBooking(row);
                        }
                    }
                );
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
                return;
            }
            
            if (!row) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
                return;
            }
            
            res.json(row);
        }
    );
});

// POST /api/bookings/:id/cancel - Cancelar agendamento
app.post('/api/bookings/:id/cancel', (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    // Primeiro buscar o agendamento atual
    db.get(
        `SELECT b.*, c.name as city FROM bookings b 
         JOIN cities c ON b.city_id = c.id 
         WHERE b.id = ?`,
        [id],
        (err: any, booking: any) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            if (!booking) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
                return;
            }

            // Atualizar no banco de dados
            db.run(
                `UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [id],
                function(err: any) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    
                    if (this.changes === 0) {
                        res.status(404).json({ error: 'Agendamento não encontrado' });
                        return;
                    }
                    
                    // Buscar o agendamento atualizado
                    db.get(
                        `SELECT b.*, c.name as city FROM bookings b 
                         JOIN cities c ON b.city_id = c.id 
                         WHERE b.id = ?`,
                        [id],
                        (err: any, updatedBooking: any) => {
                            if (!err && updatedBooking) {
                                // Garantir que o status seja 'cancelled'
                                updatedBooking.status = 'cancelled';
                                
                                // Atualizar no Google Sheets
                                if (sheetsService) {
                                    sheetsService.updateBooking(updatedBooking);
                                }
                            }
                            
                            res.json({ 
                                message: 'Agendamento cancelado com sucesso',
                                reason: reason || 'Cancelado pelo fornecedor',
                                status: 'cancelled'
                            });
                        }
                    );
                }
            );
        }
    );
});

// PUT /api/bookings/:id - Atualizar agendamento
app.put('/api/bookings/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { city_id, company_name, vehicle_plate, invoice_number, driver_name, booking_date, booking_time } = req.body;

    // Primeiro verificar se o agendamento existe
    db.get(
        `SELECT * FROM bookings WHERE id = ?`,
        [id],
        (err: any, existingBooking: any) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            if (!existingBooking) {
                res.status(404).json({ error: 'Agendamento não encontrado' });
                return;
            }

            // Atualizar no banco de dados
            db.run(
                `UPDATE bookings SET 
                    city_id = COALESCE(?, city_id),
                    company_name = COALESCE(?, company_name),
                    vehicle_plate = COALESCE(?, vehicle_plate),
                    invoice_number = COALESCE(?, invoice_number),
                    driver_name = COALESCE(?, driver_name),
                    booking_date = COALESCE(?, booking_date),
                    booking_time = COALESCE(?, booking_time),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    city_id, company_name, vehicle_plate, invoice_number, 
                    driver_name, booking_date, booking_time, id
                ],
                function(err: any) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    
                    if (this.changes === 0) {
                        res.status(404).json({ error: 'Agendamento não encontrado' });
                        return;
                    }
                    
                    // Buscar o agendamento atualizado com nome da cidade
                    db.get(
                        `SELECT b.*, c.name as city FROM bookings b 
                         JOIN cities c ON b.city_id = c.id 
                         WHERE b.id = ?`,
                        [id],
                        (err: any, updatedBooking: any) => {
                            if (!err && updatedBooking) {
                                // Atualizar no Google Sheets
                                if (sheetsService) {
                                    sheetsService.updateBooking(updatedBooking);
                                }
                                
                                res.json({ 
                                    message: 'Agendamento atualizado com sucesso',
                                    booking: updatedBooking
                                });
                            } else {
                                res.json({ 
                                    message: 'Agendamento atualizado com sucesso'
                                });
                            }
                        }
                    );
                }
            );
        }
    );
});

// GET /api/cdl/unavailabilities/:city_id - Listar indisponibilidades
app.get('/api/cdl/unavailabilities/:city_id', (req: Request, res: Response) => {
    const { city_id } = req.params;

    db.all(
        `SELECT u.*, c.name as city_name FROM unavailabilities u 
         JOIN cities c ON u.city_id = c.id 
         WHERE u.city_id = ? ORDER BY u.unavailable_date DESC`,
        [city_id],
        (err: any, rows: any) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows || []);
        }
    );
});

// POST /api/cdl/unavailability - Registrar indisponibilidade
app.post('/api/cdl/unavailability', (req: Request, res: Response) => {
    const { pin, city_id, unavailable_date, unavailable_time, reason } = req.body;

    // Validar PIN (padrão: 1235)
    if (pin !== '1235') {
        res.status(401).json({ error: 'PIN inválido' });
        return;
    }

    if (!city_id || !unavailable_date || !reason) {
        res.status(400).json({ error: 'Campos obrigatórios faltando' });
        return;
    }

    // Buscar o nome da cidade
    db.get(
        `SELECT name FROM cities WHERE id = ?`,
        [city_id],
        (err: any, cityRow: any) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            if (!cityRow) {
                res.status(404).json({ error: 'Cidade não encontrada' });
                return;
            }

            const cityName = cityRow.name;

            // Inserir a indisponibilidade
            db.run(
                `INSERT INTO unavailabilities (city_id, unavailable_date, unavailable_time, reason)
                 VALUES (?, ?, ?, ?)`,
                [city_id, unavailable_date, unavailable_time || null, reason],
                function(err: any) {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    
                    const unavailabilityId = this.lastID;
                    res.json({ 
                        message: 'Indisponibilidade registrada com sucesso', 
                        id: unavailabilityId 
                    });
                    
                    // Sincronizar com Google Sheets se disponível
                    if (sheetsService) {
                        sheetsService.appendUnavailability({
                            city_id,
                            city_name: cityName,
                            unavailable_date,
                            unavailable_time: unavailable_time || 'Dia Inteiro',
                            reason
                        });
                    }
                }
            );
        }
    );
});

// GET /api/cities - Listar todas as cidades
app.get('/api/cities', (_req: Request, res: Response) => {
    db.all(`SELECT * FROM cities ORDER BY state, name`, (err: any, rows: any) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows || []);
    });
});

// GET /api/health - Health check
app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rota para servir o frontend
app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
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