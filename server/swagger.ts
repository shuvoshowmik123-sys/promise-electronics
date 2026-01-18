import * as swaggerJsdocModule from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

// Handle both ESM and CJS exports
const swaggerJsdoc = (swaggerJsdocModule as any).default || swaggerJsdocModule;

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Promise Electronics API',
            version: '1.0.0',
            description: `
## Overview
Complete API documentation for Promise Electronics - TV Repair & Electronics Retail System.

### Authentication
- **Admin Routes**: Require session-based authentication via \`/api/admin/login\`
- **Customer Routes**: Require customer session via \`/api/customer/login\`
- **Public Routes**: No authentication required

### Base URL
- **Production**: \`https://promiseelectronics.com\`
- **Development**: \`http://localhost:5083\`
      `,
            contact: {
                name: 'Promise Electronics',
                email: 'support@promiseelectronics.com',
            },
        },
        servers: [
            {
                url: 'https://promiseelectronics.com',
                description: 'Production Server',
            },
            {
                url: 'http://localhost:5083',
                description: 'Development Server',
            },
        ],
        tags: [
            { name: 'Auth', description: 'Admin authentication endpoints' },
            { name: 'Customer', description: 'Customer authentication and profile' },
            { name: 'Jobs', description: 'Job ticket management' },
            { name: 'Service Requests', description: 'Customer service requests' },
            { name: 'Orders', description: 'E-commerce order management' },
            { name: 'Inventory', description: 'Product and inventory management' },
            { name: 'POS', description: 'Point of sale transactions' },
            { name: 'Finance', description: 'Petty cash and due records' },
            { name: 'Users', description: 'User and staff management' },
            { name: 'Settings', description: 'Application settings and policies' },
            { name: 'AI', description: 'AI chat and lens endpoints' },
            { name: 'Upload', description: 'File upload endpoints' },
        ],
        components: {
            securitySchemes: {
                sessionAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'connect.sid',
                    description: 'Session cookie authentication',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', description: 'Error message' },
                        details: { type: 'object', description: 'Additional error details' },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        username: { type: 'string' },
                        email: { type: 'string' },
                        role: { type: 'string', enum: ['Super Admin', 'Admin', 'Accountant', 'Technician', 'Customer'] },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                JobTicket: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        customer: { type: 'string' },
                        phone: { type: 'string' },
                        device: { type: 'string' },
                        issue: { type: 'string' },
                        status: { type: 'string', enum: ['Pending', 'Diagnosing', 'In Progress', 'Waiting Parts', 'Ready', 'Delivered'] },
                        technician: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                ServiceRequest: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        ticketNumber: { type: 'string' },
                        customerName: { type: 'string' },
                        phone: { type: 'string' },
                        brand: { type: 'string' },
                        screenSize: { type: 'string' },
                        stage: { type: 'string' },
                        trackingStatus: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                Order: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        orderNumber: { type: 'string' },
                        customerId: { type: 'integer' },
                        status: { type: 'string', enum: ['Pending', 'Accepted', 'Processing', 'Shipped', 'Delivered', 'Declined'] },
                        total: { type: 'number' },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                InventoryItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        category: { type: 'string' },
                        stock: { type: 'integer' },
                        purchasePrice: { type: 'number' },
                        sellPrice: { type: 'number' },
                    },
                },
            },
        },
    },
    apis: ['./server/routes/*.ts', './server/routes/**/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
    // Serve Swagger UI
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Promise Electronics API Docs',
    }));

    // Serve raw OpenAPI spec
    app.get('/api/docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });

    console.log('📚 Swagger docs available at /api/docs');
};

export { swaggerSpec };
