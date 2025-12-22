import 'dotenv/config';
import { db } from "../server/db";
import { policies } from "../shared/schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

const PRIVACY_POLICY = {
    slug: "privacy",
    title: "Privacy Policy",
    content: `
# Privacy Policy

**Effective Date:** December 20, 2025

## 1. Introduction
Welcome to Promise Electronics. We value your privacy and are committed to protecting your personal information. This Privacy Policy explains how we collect, use, and safeguard your data when you use our services, including our website and mobile application.

## 2. Information We Collect
We collect information that you provide directly to us, such as:
*   **Personal Information:** Name, phone number, email address, and physical address.
*   **Service Information:** Details about your devices, repair requests, and service history.
*   **Payment Information:** Transaction details (we do not store full credit card numbers).

## 3. How We Use Your Information
We use your information to:
*   Provide and improve our repair services.
*   Communicate with you about your service requests and orders.
*   Process payments and send invoices.
*   Send you important updates and promotional offers (you can opt-out).

## 4. Data Sharing
We do not sell your personal information. We may share your data with:
*   **Service Providers:** Technicians and delivery partners who help us fulfill your requests.
*   **Legal Authorities:** If required by law or to protect our rights.

## 5. Data Security
We implement appropriate security measures to protect your data from unauthorized access, alteration, or disclosure. However, no method of transmission over the internet is 100% secure.

## 6. Your Rights
You have the right to:
*   Access and update your personal information.
*   Request the deletion of your account.
*   Opt-out of marketing communications.

## 7. Contact Us
If you have any questions about this Privacy Policy, please contact us at:
*   **Email:** support@promise-electronics.com
*   **Phone:** +880 1234 567890
  `,
    isPublished: true,
};

const TERMS_AND_CONDITIONS = {
    slug: "terms",
    title: "Terms & Conditions",
    content: `
# Terms & Conditions

**Effective Date:** December 20, 2025

## 1. Acceptance of Terms
By accessing or using the Promise Electronics website and mobile application, you agree to be bound by these Terms & Conditions. If you do not agree, please do not use our services.

## 2. Services Provided
Promise Electronics provides electronics repair services, sells electronic parts and accessories, and offers related services. We reserve the right to modify or discontinue any service at any time.

## 3. User Accounts
To use certain features, you may need to create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.

## 4. Service Requests & Repairs
*   **Estimates:** Repair estimates are subject to change upon physical inspection of the device.
*   **Warranty:** We provide a limited warranty on our repairs. Please refer to our Warranty Policy for details.
*   **Unclaimed Devices:** Devices left unclaimed for more than 30 days after repair completion may be disposed of to recover costs.

## 5. Payments
*   Payments are due upon completion of services or purchase of products.
*   We accept various payment methods as indicated on our platform.
*   All prices are subject to change without notice.

## 6. Limitation of Liability
Promise Electronics shall not be liable for any indirect, incidental, special, or consequential damages arising out of or in connection with the use of our services. Our total liability shall not exceed the amount paid by you for the specific service or product.

## 7. Intellectual Property
All content on our platform, including text, graphics, logos, and software, is the property of Promise Electronics and is protected by copyright laws.

## 8. Governing Law
These Terms & Conditions shall be governed by and construed in accordance with the laws of Bangladesh.

## 9. Changes to Terms
We may update these Terms & Conditions from time to time. We will notify you of any significant changes. Your continued use of our services constitutes acceptance of the new terms.

## 10. Contact Information
For any questions regarding these Terms, please contact us at support@promise-electronics.com.
  `,
    isPublished: true,
};

async function seedPolicies() {
    try {
        console.log("Seeding policies...");

        const policiesToSeed = [PRIVACY_POLICY, TERMS_AND_CONDITIONS];

        for (const policy of policiesToSeed) {
            const existingPolicy = await db.query.policies.findFirst({
                where: eq(policies.slug, policy.slug),
            });

            if (existingPolicy) {
                console.log(`${policy.title} already exists, updating...`);
                await db
                    .update(policies)
                    .set({
                        title: policy.title,
                        content: policy.content,
                        lastUpdated: new Date(),
                        isPublished: policy.isPublished,
                    })
                    .where(eq(policies.slug, policy.slug));
            } else {
                console.log(`Creating ${policy.title}...`);
                await db.insert(policies).values({
                    id: nanoid(),
                    ...policy,
                    lastUpdated: new Date(),
                });
            }
        }

        console.log("Policies seeded successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding policies:", error);
        process.exit(1);
    }
}

seedPolicies();
