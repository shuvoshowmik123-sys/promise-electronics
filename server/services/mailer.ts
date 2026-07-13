import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// MAILER_OVERRIDE=pass  → all sends return true without SMTP (test seam)
// MAILER_OVERRIDE=fail  → all sends return false without SMTP (test seam)
const MAILER_OVERRIDE = process.env.MAILER_OVERRIDE as 'pass' | 'fail' | undefined;

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character] as string));
}

async function sendMail(options: nodemailer.SendMailOptions): Promise<boolean> {
    if (MAILER_OVERRIDE === 'pass') return true;
    if (MAILER_OVERRIDE === 'fail') return false;
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[Mailer] SMTP credentials not configured');
        return false;
    }
    try {
        await transporter.sendMail(options);
        return true;
    } catch (error) {
        console.error('[Mailer] Send failed:', (error as Error).message);
        return false;
    }
}

export const MailerService = {
    async sendCorporateSetupLink(to: string, name: string, setupUrl: string): Promise<boolean> {
        const safeName = escapeHtml(name);
        const safeUrl = escapeHtml(setupUrl);
        return sendMail({
            from: `"Promise Electronics" <${process.env.SMTP_USER}>`,
            to,
            subject: 'Set up your Promise Electronics Corporate Portal account',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #1e3a8a;">Welcome, ${safeName}!</h2>
          <p>Your corporate account has been created. Click the button below to set your password and activate your account.</p>
          <p>This link expires in 30 minutes and can only be used once.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${safeUrl}" style="background-color: #1e3a8a; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Set Up Account</a>
          </div>
          <p style="color: #6b7280; font-size: 13px;">If the button doesn't work, copy and paste this link into your browser:<br>${safeUrl}</p>
          <p>Best regards,<br>Promise Electronics Team</p>
        </div>`,
        });
    },

    async sendCorporateResetLink(to: string, name: string, resetUrl: string): Promise<boolean> {
        const safeName = escapeHtml(name);
        const safeUrl = escapeHtml(resetUrl);
        return sendMail({
            from: `"Promise Electronics" <${process.env.SMTP_USER}>`,
            to,
            subject: 'Reset your Promise Electronics Corporate Portal password',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #1e3a8a;">Password Reset</h2>
          <p>Hi ${safeName}, a password reset was requested for your account. Click the button below to set a new password.</p>
          <p>This link expires in 30 minutes and can only be used once. Your current password remains valid until you complete this process.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${safeUrl}" style="background-color: #1e3a8a; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #6b7280; font-size: 13px;">If you did not request this, ignore this email. Your password has not changed.<br>Link: ${safeUrl}</p>
          <p>Best regards,<br>Promise Electronics Team</p>
        </div>`,
        });
    },
};
