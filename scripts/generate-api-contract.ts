import swaggerJsdoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Promise Integrated System API Contract',
            version: '1.0.0',
            description: 'Snapshot of the API contract for quality gating and client generation.',
        },
        servers: [
            {
                url: 'http://localhost:5000',
                description: 'Development Server',
            },
        ],
    },
    // Paths to files containing OpenAPI definitions
    apis: [
        path.join(__dirname, '../server/routes/**/*.ts'),
        path.join(__dirname, '../server/index.ts'),
    ],
};

const openapiSpecification = swaggerJsdoc(options);

// Output the snapshot to the project root
const outputPath = path.join(__dirname, '../api-contract-snapshot.json');
fs.writeFileSync(outputPath, JSON.stringify(openapiSpecification, null, 2));

console.log(`API Contract Snapshot successfully generated at: ${outputPath}`);
