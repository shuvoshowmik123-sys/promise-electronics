const REQUIRED_ALWAYS = ['DATABASE_URL', 'SESSION_SECRET'];
const REQUIRED_PROD_OPTIONAL = [
    'IMAGEKIT_PRIVATE_KEY', 'IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_URL_ENDPOINT',
    'BRAIN_DATABASE_URL'
];

export function validateEnv() {
    const missing = REQUIRED_ALWAYS.filter(k => !process.env[k]);

    if (missing.length > 0) {
        console.error(`❌ Startup Error: Missing required environment variables: ${missing.join(', ')}`);
        console.error(`💡 Please check your .env file or environment configuration.`);
        // In a serverless environment, process.exit kills the function invocation
        // Instead, throw an error that can be caught by the caller
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (process.env.NODE_ENV === 'production') {
        const missingOptional = REQUIRED_PROD_OPTIONAL.filter(k => !process.env[k]);
        if (missingOptional.length > 0) {
            // Only warn for optional production vars — don't crash the server
            console.warn(`⚠️  Warning: Optional production env vars not set: ${missingOptional.join(', ')}`);
            console.warn(`💡 Some features (e.g. ImageKit uploads) may not work correctly.`);
        }
    }

    console.log(`✅ Environment variables validation passed.`);
}
