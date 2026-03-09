import nodemailer from 'nodemailer';

// Use environment variables for configuration
// For Gmail, users can use an App Password: https://support.google.com/accounts/answer/185833
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER, // Your Gmail address
        pass: process.env.SMTP_PASS, // Your Gmail App Password
    },
});

export const MailerService = {
    async sendWelcomeEmail(to: string, name: string, username: string, password: string) {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.warn("SMTP credentials not found. Skipping email sending.");
            return false;
        }

        const mailOptions = {
            from: `"Promise Electronics" <${process.env.SMTP_USER}>`,
            to,
            subject: 'Welcome to Promise Electronics Corporate Portal',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #1e3a8a;">Welcome, ${name}!</h2>
          <p>Your corporate account has been created by the Promise Electronics Admin team.</p>
          <p>You can now log in to the Corporate Portal to track repairs, request pickups, and view billing information.</p>
          
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
          </div>

          <p>Please keep these credentials secure.</p>
          
          <p>Best regards,<br>Promise Electronics Team</p>
        </div>
      `,
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            console.log('Email sent: ' + info.response);
            return true;
        } catch (error) {
            console.error('Error sending email:', error);
            return false;
        }
    }
};
