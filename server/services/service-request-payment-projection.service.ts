import { jobRepo } from '../repositories/index.js';
import type { ServiceRequest } from '../repositories/base.js';

export type DerivedPaymentState = {
    paymentStatus: string;
    paidAmount: number | null;
    estimatedCost: number | null;
    paymentSource: 'job' | 'service_request' | 'none';
};

const PAID_LIKE = new Set(['paid', 'completed', 'settled']);

export function isPaidLike(status: string | null | undefined): boolean {
    if (!status) return false;
    return PAID_LIKE.has(String(status).trim().toLowerCase());
}

export async function deriveServiceRequestPaymentState(
    sr: Pick<ServiceRequest, 'convertedJobId' | 'paymentStatus'>,
): Promise<DerivedPaymentState> {
    if (sr.convertedJobId) {
        const job = await jobRepo.getJobTicket(sr.convertedJobId);
        if (job) {
            return {
                paymentStatus: String(job.paymentStatus ?? 'unpaid'),
                paidAmount: job.paidAmount != null ? Number(job.paidAmount) : null,
                estimatedCost: job.estimatedCost != null ? Number(job.estimatedCost) : null,
                paymentSource: 'job',
            };
        }
    }
    const rawStatus = String(sr.paymentStatus ?? 'Due');
    return {
        paymentStatus: isPaidLike(rawStatus) ? 'unpaid' : rawStatus,
        paidAmount: null,
        estimatedCost: null,
        paymentSource: sr.convertedJobId ? 'none' : 'service_request',
    };
}

export function applyDerivedPaymentState<T extends Record<string, any>>(
    sr: T,
    state: DerivedPaymentState,
): T {
    return { ...sr, paymentStatus: state.paymentStatus, derivedPayment: state };
}

export function applyCustomerSafePaymentState<T extends Record<string, any>>(
    sr: T,
    state: DerivedPaymentState,
): T {
    const { derivedPayment: _omitDerived, ...rest } = sr as Record<string, unknown> & T;
    return { ...rest, paymentStatus: state.paymentStatus } as T;
}