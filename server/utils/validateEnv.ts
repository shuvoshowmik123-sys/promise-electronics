const REQUIRED_ALWAYS = ['DATABASE_URL', 'SESSION_SECRET'];
const REQUIRED_PROD = [
    'IMAGEKIT_PRIVATE_KEY', 'IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_URL_ENDPOINT'
];

export function validateEnv() {
    const missing = REQUIRED_ALWAYS.filter(k => !process.env[k]);

    if (process.env.NODE_ENV === 'production') {
        missing.push(...REQUIRED_PROD.filter(k => !process.env[k]));
    }

    if (missing.length > 0) {
        console.error(`❌ Startup Error: Missing required environment variables: ${missing.join(', ')}`);
        console.error(`💡 Please check your .env file or environment configuration.`);
        process.exit(1);
    }

    console.log(`✅ Environment variables validation passed.`);
}
