/**
 * SMS Service
 * 
 * Handles sending SMS messages via SMS.net.bd API.
 * Used for OTP verification and customer notifications.
 */

interface SendSmsOptions {
    to: string;
    message: string;
}

interface SmsResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Normalize Bangladesh phone number to international format
 * Accepts: 01712345678, +8801712345678, 8801712345678
 * Returns: 8801712345678 (no + prefix for SMS API)
 */
function normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let normalized = phone.replace(/\D/g, '');

    // If starts with 0, assume Bangladesh and add country code
    if (normalized.startsWith('0')) {
        normalized = '88' + normalized;
    }

    // If doesn't start with 88, add it
    if (!normalized.startsWith('88')) {
        normalized = '88' + normalized;
    }

    return normalized;
}

/**
 * Validate Bangladesh phone number format
 * Valid patterns: 01[3-9]XXXXXXXX (11 digits local)
 */
function isValidBangladeshPhone(phone: string): boolean {
    const normalized = normalizePhoneNumber(phone);
    // Bangladesh numbers: 880 + 1 + [3-9] + 8 more digits = 13 digits total
    const bdPattern = /^880(1[3-9]\d{8})$/;
    return bdPattern.test(normalized);
}

/**
 * Send SMS via SMS.net.bd API
 */
async function sendSms(options: SendSmsOptions): Promise<SmsResponse> {
    const apiUrl = process.env.SMS_API_URL;
    const apiKey = process.env.SMS_API_KEY;

    if (!apiUrl || !apiKey) {
        console.error('[SMS] API URL or Key not configured');
        return { success: false, error: 'SMS service not configured' };
    }

    const normalizedPhone = normalizePhoneNumber(options.to);

    if (!isValidBangladeshPhone(options.to)) {
        console.error('[SMS] Invalid phone number format:', options.to);
        return { success: false, error: 'Invalid phone number format' };
    }

    try {
        console.log(`[SMS] Sending to ${normalizedPhone}: "${options.message.substring(0, 50)}..."`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: apiKey,
                msg: options.message,
                to: normalizedPhone,
            }),
        });

        const result = await response.json();

        console.log('[SMS] API Response:', JSON.stringify(result));

        // SMS.net.bd returns error code 0 for success
        if (result.error === 0 || result.error === '0' || result.status === 'success') {
            return {
                success: true,
                messageId: result.msg_id || result.message_id || 'sent',
            };
        } else {
            return {
                success: false,
                error: result.msg || result.message || 'Failed to send SMS',
            };
        }
    } catch (error: any) {
        console.error('[SMS] Error sending SMS:', error);
        return {
            success: false,
            error: error.message || 'Network error while sending SMS',
        };
    }
}

/**
 * Generate a random 6-digit OTP code
 */
function generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP verification code via SMS
 */
async function sendOtpSms(phone: string, code: string): Promise<SmsResponse> {
    const message = `Your Promise Electronics verification code is: ${code}. Valid for 5 minutes. Do not share this code.`;

    return sendSms({
        to: phone,
        message,
    });
}

/**
 * Send service request confirmation SMS
 */
async function sendRequestConfirmationSms(
    phone: string,
    ticketNumber: string,
    customerName: string
): Promise<SmsResponse> {
    const message = `Dear ${customerName}, your service request #${ticketNumber} has been received. Track at promise-electronics.com/track. Thank you!`;

    return sendSms({
        to: phone,
        message,
    });
}

/**
 * Send quote notification SMS
 */
async function sendQuoteNotificationSms(
    phone: string,
    ticketNumber: string,
    amount: number,
    currency: string = '৳'
): Promise<SmsResponse> {
    const message = `Your quote for service request #${ticketNumber} is ready: ${currency}${amount.toLocaleString()}. View details at promise-electronics.com/track`;

    return sendSms({
        to: phone,
        message,
    });
}

/**
 * Send status update SMS
 */
async function sendStatusUpdateSms(
    phone: string,
    ticketNumber: string,
    newStatus: string
): Promise<SmsResponse> {
    const message = `Service request #${ticketNumber} update: ${newStatus}. Track at promise-electronics.com/track`;

    return sendSms({
        to: phone,
        message,
    });
}

export const smsService = {
    sendSms,
    sendOtpSms,
    sendRequestConfirmationSms,
    sendQuoteNotificationSms,
    sendStatusUpdateSms,
    generateOtpCode,
    normalizePhoneNumber,
    isValidBangladeshPhone,
};
