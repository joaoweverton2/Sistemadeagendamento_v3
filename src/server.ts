// Linha ~349: Corrigir rota /api/admin/health-detailed
app.get('/api/admin/health-detailed', (req: Request, res: Response) => {
    const { key } = req.query;
    
    const expectedKey = process.env.ADMIN_SYNC_KEY;
    
    if (!expectedKey || key !== expectedKey) {
        res.status(401).json({ 
            success: false,
            error: 'Não autorizado'
        });
        return; // ADICIONAR RETURN
    }
    
    // Verificar saúde de todos os componentes
    const healthChecks = {
        database: 'pending',
        google_sheets: 'pending',
        memory: 'pending',
        api: 'pending'
    };
    
    // Verificar banco de dados
    db.get('SELECT 1 as test', (err) => {
        healthChecks.database = err ? 'error' : 'ok';
        
        // Verificar Google Sheets
        if (!sheetsService) {
            healthChecks.google_sheets = 'not_configured';
        } else {
            healthChecks.google_sheets = 'configured';
        }
        
        // Verificar memória
        healthChecks.memory = 'ok';
        const used = process.memoryUsage();
        const memoryRatio = used.heapUsed / used.heapTotal;
        if (memoryRatio > 0.9) {
            healthChecks.memory = 'warning';
        }
        
        healthChecks.api = 'ok';
        
        res.json({
            success: true,
            status: 'operational',
            timestamp: new Date().toISOString(),
            checks: healthChecks,
            memory: {
                heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
                rss: Math.round(used.rss / 1024 / 1024) + 'MB',
                ratio: Math.round(memoryRatio * 100) + '%'
            }
        });
    });
});

// Linha ~400: Corrigir rota POST /api/admin/backup
app.post('/api/admin/backup', (req: Request, res: Response) => {
    const { admin_key } = req.body;
    
    const expectedKey = process.env.ADMIN_SYNC_KEY || 'admin-sync-123';
    
    if (admin_key !== expectedKey) {
        res.status(401).json({ 
            error: 'Não autorizado',
            message: 'Chave de administração inválida'
        });
        return; // ADICIONAR RETURN
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

// Linha ~509: Corrigir a comparação da porta
app.listen(PORT, () => {
    const portNum = typeof PORT === 'string' ? parseInt(PORT) : PORT;
    const portPadding = portNum < 1000 ? ' ' : '';
    
    console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║  🚀 Servidor de Agendamento de Mercadorias                           ║
║  Rodando em: http://localhost:${PORT}${portPadding}                                ║
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