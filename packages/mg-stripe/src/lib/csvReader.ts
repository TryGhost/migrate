import {readFileSync} from 'fs';
import {Logger} from './Logger.js';

export function readSubscriptionIdsFromCsv(filePath: string): string[] {
    try {
        const fileContent = readFileSync(filePath, 'utf-8');
        const lines = fileContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }
        
        // Parse CSV header
        const header = lines[0].trim().toLowerCase();
        const columns = header.split(',').map(col => col.trim());
        
        // Find the subscription_id column index
        const subscriptionIdIndex = columns.indexOf('subscription_id');
        
        if (subscriptionIdIndex === -1) {
            throw new Error('CSV file must have a "subscription_id" column');
        }
        
        const subscriptionIds: string[] = [];
        
        // Process data rows (skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines
            if (!line) {
                continue;
            }
            
            // Split by comma and get the subscription_id column value
            const values = line.split(',').map(val => val.trim());
            
            if (values.length > subscriptionIdIndex) {
                const id = values[subscriptionIdIndex];
                
                // Basic validation for subscription ID format (starts with sub_)
                if (id && id.startsWith('sub_')) {
                    subscriptionIds.push(id);
                } else if (id) {
                    Logger.shared.warn(`Line ${i + 1}: Skipping invalid subscription ID: ${id}`);
                }
            }
        }
        
        if (subscriptionIds.length === 0) {
            throw new Error('No valid subscription IDs found in CSV file');
        }
        
        return subscriptionIds;
    } catch (error: any) {
        throw new Error(`Failed to read CSV file: ${error.message}`);
    }
}