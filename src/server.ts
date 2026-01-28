import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { restoreFromGoogleSheets, forceSyncFromGoogleSheets } from './database.js';
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
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: 'connected',
        googleSheets: sheetsService ? 'connected' : 'disabled',
        uptime: process.uptime()
    });
});

// POST /api/admin/sync-sheets - Sincronizar manualmente com Google Sheets (PROTEGIDO)
app.post('/api/admin/sync-sheets', (req: Request, res: Response) => {
    const { admin_key } = req.body;
    
    // Chave de administração (configure no Render como ADMIN_SYNC_KEY)
    const expectedKey = process.env.ADMIN_SYNC_KEY || 'admin-sync-123';
    
    if (admin_key !== expectedKey) {
        return res.status(401).json({ 
            error: 'Não autorizado',
            message: 'Chave de administração inválida'
        });
    }
    
    if (!sheetsService) {
        return res.status(400).json({ 
            error: 'Google Sheets não configurado',
            message: 'Configure as variáveis GOOGLE_SHEETS_SPREADSHEET_ID e GOOGLE_SHEETS_CREDENTIALS_PATH'
        });
    }
    
    console.log('🔄 Sincronização manual solicitada via API');
    
    forceSyncFromGoogleSheets(sheetsService)
        .then(() => {
            // Contar agendamentos após sincronização
            db.all('SELECT COUNT(*) as count FROM bookings', [], (err, rows: any[]) => {
                if (err) {
                    res.json({ 
                        message: 'Sincronização concluída, mas erro ao contar registros',
                        error: err.message
                    });
                    return;
                }
                
                res.json({ 
                    message: 'Sincronização com Google Sheets concluída com sucesso',
                    bookings_count: rows[0].count,
                    timestamp: new Date().toISOString()
                });
            });
        })
        .catch(error => {
            console.error('❌ Erro na sincronização manual:', error);
            res.status(500).json({ 
                error: 'Erro na sincronização',
                message: error.message 
            });
        });
});

// POST /api/admin/backup - Criar backup manual (PROTEGIDO)
app.post('/api/admin/backup', (req: Request, res: Response) => {
    const { admin_key } = req.body;
    
    const expectedKey = process.env.ADMIN_SYNC_KEY || 'admin-sync-123';
    
    if (admin_key !== expectedKey) {
        return res.status(401).json({ 
            error: 'Não autorizado',
            message: 'Chave de administração inválida'
        });
    }
    
    // Contar registros atuais
    db.all(`
        SELECT 
            (SELECT COUNT(*) FROM bookings) as bookings_count,
            (SELECT COUNT(*) FROM unavailabilities) as unavailabilities_count,
            (SELECT COUNT(*) FROM cities) as cities_count
    `, [], (err, rows: any[]) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const counts = rows[0];
        
        res.json({
            message: 'Backup manual solicitado',
            backup_type: 'database_snapshot',
            timestamp: new Date().toISOString(),
            counts: {
                bookings: counts.bookings_count,
                unavailabilities: counts.unavailabilities_count,
                cities: counts.cities_count
            },
            google_sheets_status: sheetsService ? 'connected' : 'disabled',
            note: 'Os dados já estão sincronizados com Google Sheets que serve como backup'
        });
    });
});

// GET /api/stats - Estatísticas do sistema
app.get('/api/stats', (_req: Request, res: Response) => {
    db.all(`
        SELECT 
            (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed') as confirmed_bookings,
            (SELECT COUNT(*) FROM bookings WHERE status = 'cancelled') as cancelled_bookings,
            (SELECT COUNT(*) FROM unavailabilities) as unavailabilities_count,
            (SELECT COUNT(*) FROM cities) as cities_count,
            (SELECT COUNT(DISTINCT city_id) FROM bookings) as cities_with_bookings,
            (SELECT COUNT(DISTINCT strftime('%Y-%m', booking_date)) FROM bookings) as months_with_bookings
    `, [], (err, rows: any[]) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const stats = rows[0];
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            statistics: {
                bookings: {
                    total: (stats.confirmed_bookings || 0) + (stats.cancelled_bookings || 0),
                    confirmed: stats.confirmed_bookings || 0,
                    cancelled: stats.cancelled_bookings || 0
                },
                unavailabilities: stats.unavailabilities_count || 0,
                cities: {
                    total: stats.cities_count || 0,
                    with_bookings: stats.cities_with_bookings || 0
                },
                activity_months: stats.months_with_bookings || 0
            },
            sync_status: {
                google_sheets: sheetsService ? 'active' : 'disabled',
                last_sync: 'on_startup'
            }
        });
    });
});

// Rota para servir o frontend
app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Função para inicializar com restauração
async function initializeServer() {
    try {
        console.log('🚀 Iniciando servidor de agendamento...');
        
        // Se temos Google Sheets configurado, restaurar dados se necessário
        if (sheetsService) {
            console.log('🔄 Verificando sincronização com Google Sheets...');
            try {
                await restoreFromGoogleSheets(sheetsService);
                console.log('✅ Sincronização com Google Sheets concluída');
            } catch (error) {
                console.error('⚠️  Falha na sincronização inicial, mas continuando...', error);
                // Não impedir o servidor de iniciar por erro no Sheets
            }
        } else {
            console.log('⚠️  Google Sheets não configurado. Sincronização desabilitada.');
        }
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║  🚀 Servidor de Agendamento de Mercadorias                           ║
║  Rodando em: http://localhost:${PORT}${PORT < 1000 ? ' ' : ''}               ║
║  Banco de dados: SQLite                                               ║
║  Google Sheets: ${sheetsService ? '✅ Sincronizado' : '❌ Desabilitado'}    ║
║  Sincronização: ${sheetsService ? 'Bidirecional (inicialização)' : 'N/A'}  ║
╚════════════════════════════════════════════════════════════════════════╝
            `);
            
            // Log de estatísticas iniciais
            db.all('SELECT COUNT(*) as count FROM bookings', [], (err, rows: any[]) => {
                if (!err && rows) {
                    console.log(`📊 Agendamentos no banco: ${rows[0].count}`);
                }
            });
        });
    } catch (error) {
        console.error('❌ Erro crítico na inicialização do servidor:', error);
        process.exit(1);
    }
}

// Iniciar servidor com tratamento de erros
initializeServer();

export default app;