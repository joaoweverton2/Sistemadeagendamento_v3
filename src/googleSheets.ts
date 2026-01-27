import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

export interface GoogleSheetsConfig {
    spreadsheetId: string;
    credentialsPath: string;
}

export class GoogleSheetsService {
    private config: GoogleSheetsConfig;
    private auth: any;

    constructor(config: GoogleSheetsConfig) {
        this.config = config;
        this.auth = new google.auth.GoogleAuth({
            keyFile: config.credentialsPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    }

    async appendBooking(booking: any): Promise<void> {
        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth as any });
            const values = [
                [
                    booking.id,
                    booking.company_name,
                    booking.vehicle_plate,
                    booking.invoice_number,
                    booking.driver_name,
                    booking.booking_date,
                    booking.booking_time,
                    booking.city || '',
                    booking.status || 'confirmed',
                    new Date().toISOString()
                ]
            ];

            await sheets.spreadsheets.values.append({
                spreadsheetId: this.config.spreadsheetId,
                range: 'Agendamentos!A:J',
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log('📊 Agendamento sincronizado com Google Sheets');
        } catch (error) {
            console.error('❌ Erro ao sincronizar agendamento com Google Sheets:', error);
        }
    }

    async appendUnavailability(unavailability: any): Promise<void> {
        try {
            const sheets = google.sheets({ version: 'v4', auth: this.auth as any });
            const values = [
                [
                    unavailability.city_id,
                    unavailability.unavailable_date,
                    unavailability.unavailable_time || 'Dia Inteiro',
                    unavailability.reason,
                    new Date().toISOString()
                ]
            ];

            await sheets.spreadsheets.values.append({
                spreadsheetId: this.config.spreadsheetId,
                range: 'Indisponibilidades!A:E',
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log('📊 Indisponibilidade sincronizada com Google Sheets');
        } catch (error) {
            console.error('❌ Erro ao sincronizar indisponibilidade com Google Sheets:', error);
        }
    }
}

export function initializeGoogleSheets(): GoogleSheetsService | null {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH || './credentials.json';

    if (!spreadsheetId) {
        console.log('⚠️  GOOGLE_SHEETS_SPREADSHEET_ID não configurado. Sincronização desabilitada.');
        return null;
    }

    if (!fs.existsSync(path.resolve(credentialsPath))) {
        console.log(`⚠️  Arquivo de credenciais não encontrado em: ${credentialsPath}. Sincronização desabilitada.`);
        return null;
    }

    return new GoogleSheetsService({ spreadsheetId, credentialsPath });
}