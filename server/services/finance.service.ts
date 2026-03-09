/**
 * Finance Service
 * 
 * Handles business logic involving due records, petty cash logging,
 * and financial transactions.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { financeRepo, posRepo } from '../repositories/index.js';

export class FinanceService {
    /**
     * Records a payment toward a Due Record, updating POS transactions
     * and automatically generating a Petty Cash entry if needed.
     */
    async recordDuePayment(
        id: string,
        paymentAmount: number,
        paymentMethod?: string
    ): Promise<schema.DueRecord> {
        const dueRecord = await financeRepo.getDueRecord(id);
        if (!dueRecord) {
            throw new Error('Due record not found');
        }

        const currentPaid = Number(dueRecord.paidAmount || 0);
        const totalAmount = Number(dueRecord.amount);

        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            throw new Error('Invalid payment amount');
        }

        if (currentPaid + paymentAmount > totalAmount) {
            throw new Error('Payment exceeds due amount');
        }

        const newPaidAmount = currentPaid + paymentAmount;
        const newStatus = newPaidAmount >= totalAmount ? 'Paid' : 'Pending';

        const updatedRecord = await financeRepo.updateDueRecord(id, {
            paidAmount: newPaidAmount,
            status: newStatus,
        });

        if (!updatedRecord) {
            throw new Error('Failed to update due record');
        }

        // If fully paid, update the linked POS transaction status
        if (newStatus === 'Paid' && dueRecord.invoice) {
            await posRepo.updatePosTransactionStatus(dueRecord.invoice, 'Paid');
        }

        // Create Petty Cash Record for the payment
        if (paymentMethod && ['Cash', 'Bank', 'bKash', 'Nagad'].includes(paymentMethod)) {
            await financeRepo.createPettyCashRecord({
                description: `Due Payment - ${dueRecord.customer} - Invoice ${dueRecord.invoice}`,
                category: 'Due Collection',
                amount: paymentAmount,
                type: paymentMethod as any,
                dueRecordId: id,
            });
        }

        return updatedRecord;
    }
}

export const financeService = new FinanceService();
