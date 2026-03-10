# Customer Portal PRD - Promise Integrated System

## 1. Executive Summary
The Customer Portal is a feature-rich, user-friendly interface designed for the clients of Promise Electronics. It provides a seamless journey from discovering services to booking repairs, tracking jobs in real-time, and managing purchased warranties.

## 2. Customer Journey & Key Modules

### 2.1 Repair & Service Intake
A multi-path intake system for different types of customer needs.
- **Intake Wizard**: A step-by-step guided process to help customers identify their device issues and initiate a repair request.
- **Get-Quote System**: A detailed form where customers can request pricing for specific repairs (LED/LCD screen replacement, etc.) before committing.
- **Repair Request**: Direct booking for known issues, allowing image uploads of the damage for better assessment.

### 2.2 Tracking & Transparency
Real-time visibility into the status of services and deliveries.
- **Track Job**: Allows customers to enter a Phone Number or Job ID to see the live status (Pending, Assessment, Repairing, Ready) and technical details.
- **Track Order**: Dashboard for shop orders (Spare parts/Accessories) showing fulfillment and shipping updates.
- **Warranty Dashboard**: "My Warranties" section where customers can see active service and parts warranties with countdowns to expiry.

### 2.3 Shop & Service Catalog
A unified marketplace for both physical goods and technical services.
- **E-commerce Shop**: Categorized browsing for televisions, spare parts, and accessories with a cart and checkout flow.
- **Service Catalog**: Detailed view of repair services including pricing ranges (Min/Max), estimated turnaround times, and "Included" benefit lists.
- **Hot Deals**: Sliding promotional banners highlighting discounted parts or limited-time service offers.

### 2.4 User Profiles & Support
- **My Profile**: Secure area for customers to manage their contact information and view history.
- **Support & FAQ**: Integrated knowledge base and contact options, including direct WhatsApp chat links.
- **Policies**: Clear links to Terms and Conditions, Privacy Policy, and Warranty Policy.

## 3. Technical Highlights
- **Real-time Updates**: Live ticket status reflects admin changes instantly via server-sent events.
- **Image Handling**: Specialized upload logic for device diagnostics.
- **Mobile Responsive**: Fully optimized for mobile browsers to facilitate on-the-go tracking.

## 4. Branding & UX
- **Theme**: Premium "Promise Electronics" branding with consistent typography and color palettes.
- **Interactive Elements**: Micro-animations during transitions (e.g., in the Intake Wizard) to improve engagement.
